import { ReplicaAgent, type ReplicaAgentConfig } from '@process/agent/replica';
import { DEFAULT_REPLICA_MODEL, resolveReplicaCodingAgent } from '@process/agent/replica/types';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { teamEventBus } from '@process/team/teamEventBus';

export interface ReplicaAgentManagerData {
  conversation_id: string;
  workspace?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  replicaId?: string;
  chatId?: string;
  environmentId?: string;
  model?: string;
  codingAgent?: 'claude' | 'codex';
  thinkingLevel?: 'low' | 'medium' | 'high' | 'max';
  planMode?: boolean;
  yoloMode?: boolean;
}

class ReplicaAgentManager extends BaseAgentManager<ReplicaAgentManagerData> {
  agent!: ReplicaAgent;
  bootstrap: Promise<ReplicaAgent>;
  private readonly options: ReplicaAgentManagerData;

  constructor(data: ReplicaAgentManagerData) {
    super('replica', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace ?? '';
    this.options = data;
    this.status = 'pending';
    this.bootstrap = this.initAgent(data);
    this.bootstrap.catch(() => {});
  }

  private async initAgent(data: ReplicaAgentManagerData): Promise<ReplicaAgent> {
    const model = data.model || DEFAULT_REPLICA_MODEL;
    const config: ReplicaAgentConfig = {
      id: data.conversation_id,
      workingDir: data.workspace || process.cwd(),
      apiKey: data.apiKey,
      apiBaseUrl: data.apiBaseUrl,
      replicaId: data.replicaId,
      chatId: data.chatId,
      environmentId: data.environmentId,
      model,
      codingAgent: data.codingAgent || resolveReplicaCodingAgent(model),
      thinkingLevel: data.thinkingLevel,
      planMode: data.planMode,
      onStreamEvent: (message) => this.handleStreamEvent(message),
      onSignalEvent: (message) => this.handleSignalEvent(message),
      onReplicaIdUpdate: (replicaId) => this.saveReplicaState({ replicaId }),
      onChatIdUpdate: (chatId) => this.saveReplicaState({ chatId }),
    };

    this.agent = new ReplicaAgent(config);
    await this.agent.start();
    return this.agent;
  }

  private handleStreamEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };
    if (['content', 'agent_status', 'acp_tool_call', 'plan'].includes(msg.type)) {
      this.status = 'finished';
    }

    const tMessage = transformMessage(msg);
    if (tMessage) {
      addOrUpdateMessage(this.conversation_id, tMessage, 'replica');
    }

    ipcBridge.conversation.responseStream.emit(msg);
    channelEventBus.emitAgentMessage(this.conversation_id, msg);
  }

  private handleSignalEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };
    if (msg.type === 'finish') {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      skillSuggestWatcher.onFinish(this.conversation_id);
      this.status = 'finished';
      teamEventBus.emit('responseStream', msg);
    }

    if (msg.type === 'error') {
      const tMessage = transformMessage(msg);
      if (tMessage) addMessage(this.conversation_id, tMessage);
      teamEventBus.emit('responseStream', msg);
    }

    ipcBridge.conversation.responseStream.emit(msg);
    channelEventBus.emitAgentMessage(this.conversation_id, msg);
  }

  private async saveReplicaState(updates: { replicaId?: string; chatId?: string }): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'replica') {
        db.updateConversation(this.conversation_id, {
          extra: { ...result.data.extra, ...updates },
        } as Partial<typeof result.data>);
      }
    } catch (error) {
      console.error('[ReplicaAgentManager] Failed to save replica state:', error);
    }
  }

  async sendMessage(data: { content: string; msg_id?: string; hidden?: boolean; silent?: boolean }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    this.status = 'running';
    try {
      await this.bootstrap;

      if (data.msg_id && data.content && !data.silent) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: { content: data.content },
          createdAt: Date.now(),
          ...(data.hidden && { hidden: true }),
        };
        addMessage(this.conversation_id, userMessage);
      }

      return await this.agent.sendMessage({ content: data.content, msg_id: data.msg_id });
    } catch (error) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      this.status = 'finished';
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to send message: ${errorMsg}`);
      throw error;
    }
  }

  private emitErrorMessage(error: string): void {
    this.handleSignalEvent({ type: 'error', conversation_id: this.conversation_id, msg_id: uuid(), data: error });
  }

  async ensureYoloMode(): Promise<boolean> {
    return true;
  }

  stop() {
    this.agent?.stop();
    return Promise.resolve();
  }

  kill() {
    try {
      this.agent?.kill();
    } finally {
      super.kill();
    }
  }
}

export default ReplicaAgentManager;
