import { uuid } from '@/common/utils';
import type {
  CreateReplicaResponse,
  ReplicaAgentConfig,
  ReplicaAgentEvent,
  ReplicaEngineEvent,
  SendReplicaMessageResponse,
} from './types';

const DEFAULT_API_BASE_URL = 'https://api.tryreplicas.com';

export type { ReplicaAgentConfig } from './types';

function requireApiKey(config: ReplicaAgentConfig): string {
  const apiKey = config.apiKey || process.env.REPLICAS_API_KEY;
  if (!apiKey) {
    throw new Error('REPLICAS_API_KEY environment variable is not set');
  }
  return apiKey;
}

function toText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item === 'object' && 'text' in item ? String(item.text ?? '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

function parseJsonObject(input: string | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function titleFromTool(name: string, input?: Record<string, unknown>): string {
  if (typeof input?.command === 'string') return `${name}: ${input.command}`;
  if (typeof input?.description === 'string') return `${name}: ${input.description}`;
  return name;
}

export class ReplicaAgent {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly abortController = new AbortController();
  private replicaId?: string;
  private chatId?: string;
  private currentTextMsgId: string | null = null;
  private processing = false;

  constructor(private readonly config: ReplicaAgentConfig) {
    this.apiKey = requireApiKey(config);
    this.apiBaseUrl = (config.apiBaseUrl || process.env.REPLICAS_API_BASE_URL || DEFAULT_API_BASE_URL).replace(
      /\/$/,
      ''
    );
    this.replicaId = config.replicaId;
    this.chatId = config.chatId;
  }

  get currentReplicaId(): string | undefined {
    return this.replicaId;
  }

  get currentChatId(): string | undefined {
    return this.chatId;
  }

  async start(): Promise<void> {
    if (this.replicaId) {
      this.openEventStream(this.replicaId);
    }
  }

  async sendMessage(input: { content: string; msg_id?: string }): Promise<{ success: boolean; message?: string }> {
    if (!this.replicaId) {
      await this.createReplica(input.content);
      return { success: true };
    }

    const response = await this.request<SendReplicaMessageResponse>(`/v1/replica/${this.replicaId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        message: input.content,
        ...(this.chatId && { chat_id: this.chatId }),
        ...(this.config.codingAgent && { coding_agent: this.config.codingAgent }),
        ...(this.config.model && { model: this.config.model }),
        ...(this.config.planMode !== undefined && { plan_mode: this.config.planMode }),
        ...(this.config.thinkingLevel && { thinking_level: this.config.thinkingLevel }),
      }),
    });

    if (response.chat_id && response.chat_id !== this.chatId) {
      this.chatId = response.chat_id;
      this.config.onChatIdUpdate?.(response.chat_id);
    }

    return { success: true, message: response.status };
  }

  stop(): void {
    this.abortController.abort();
  }

  kill(): void {
    this.stop();
  }

  private async createReplica(message: string): Promise<void> {
    const name = `aionui-${Date.now()}`;
    const response = await this.request<CreateReplicaResponse>('/v1/replica', {
      method: 'POST',
      body: JSON.stringify({
        name,
        message,
        ...(this.config.environmentId && { environment_id: this.config.environmentId }),
        ...(this.config.codingAgent && { coding_agent: this.config.codingAgent }),
        ...(this.config.model && { model: this.config.model }),
        ...(this.config.planMode !== undefined && { plan_mode: this.config.planMode }),
        ...(this.config.thinkingLevel && { thinking_level: this.config.thinkingLevel }),
      }),
    });

    this.replicaId = response.replica.id;
    this.config.onReplicaIdUpdate?.(response.replica.id);
    this.openEventStream(response.replica.id);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Replicas API ${response.status}: ${body || response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private openEventStream(replicaId: string): void {
    void this.readEventStream(replicaId).catch((error) => {
      if (!this.abortController.signal.aborted) {
        this.emitError(error instanceof Error ? error.message : String(error));
      }
    });
  }

  private async readEventStream(replicaId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/v1/replica/${replicaId}/events`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: this.abortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Replicas event stream ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!this.abortController.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) this.handleSseEvent(event);
    }
  }

  private handleSseEvent(raw: string): void {
    const dataLines = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) return;

    try {
      const event = JSON.parse(dataLines.join('\n')) as ReplicaEngineEvent;
      this.handleEngineEvent(event);
    } catch {
      // Ignore keepalives or malformed lines.
    }
  }

  private handleEngineEvent(event: ReplicaEngineEvent): void {
    if (event.payload?.chatId && event.payload.chatId !== this.chatId) {
      this.chatId = event.payload.chatId;
      this.config.onChatIdUpdate?.(event.payload.chatId);
    }

    switch (event.type) {
      case 'chat.turn.accepted':
      case 'chat.turn.started':
        this.processing = true;
        this.currentTextMsgId = null;
        this.config.onStreamEvent({
          type: 'agent_status',
          conversation_id: this.config.id,
          msg_id: uuid(),
          data: { backend: 'replica', status: 'session_active', agentName: 'Replicas' },
        });
        break;
      case 'chat.turn.delta':
        this.handleAgentEvent(event.payload?.event as ReplicaAgentEvent | undefined);
        break;
      case 'chat.turn.completed':
        this.processing = false;
        this.currentTextMsgId = null;
        this.config.onSignalEvent({ type: 'finish', conversation_id: this.config.id, msg_id: uuid(), data: null });
        break;
      case 'chat.interrupted':
        this.processing = false;
        this.currentTextMsgId = null;
        this.config.onSignalEvent({ type: 'finish', conversation_id: this.config.id, msg_id: uuid(), data: null });
        break;
      case 'error':
        this.emitError(String(event.payload?.message || 'Unknown Replicas error'));
        break;
      default:
        break;
    }
  }

  private handleAgentEvent(event: ReplicaAgentEvent | undefined): void {
    if (!event?.payload) return;

    if (event.type === 'claude-assistant') {
      for (const block of event.payload.message?.content ?? []) {
        if (block.type === 'text' && block.text) this.emitContent(block.text);
        if (block.type === 'thinking' && block.text) this.emitThought(block.text);
        if (block.type === 'tool_use') {
          this.emitToolCall(block.id || uuid(), block.name || 'tool', block.input, 'in_progress');
        }
      }
      return;
    }

    if (event.type === 'claude-user') {
      for (const block of event.payload.message?.content ?? []) {
        if (block.type === 'tool_result') {
          this.emitToolResult(
            block.tool_use_id || uuid(),
            toText(block.content),
            block.is_error ? 'failed' : 'completed'
          );
        }
      }
      return;
    }

    if (event.type === 'event_msg' && event.payload.type === 'agent_reasoning') {
      const text =
        event.payload.text ||
        event.payload.content
          ?.map((item) => item.text)
          .filter(Boolean)
          .join('\n');
      if (text) this.emitThought(text);
      return;
    }

    if (event.type === 'response_item') {
      const payload = event.payload;
      if (payload.type === 'message') {
        const text = payload.content
          ?.map((item) => item.text)
          .filter(Boolean)
          .join('\n');
        if (text) this.emitContent(text);
      } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
        this.emitToolCall(
          payload.call_id || uuid(),
          payload.name || payload.type,
          parseJsonObject(payload.arguments || payload.input),
          'in_progress'
        );
      } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
        this.emitToolResult(payload.call_id || uuid(), payload.output || '', 'completed');
      }
    }
  }

  private emitContent(text: string): void {
    if (!this.currentTextMsgId) this.currentTextMsgId = uuid();
    this.config.onStreamEvent({
      type: 'content',
      conversation_id: this.config.id,
      msg_id: this.currentTextMsgId,
      data: text,
    });
  }

  private emitThought(description: string): void {
    this.config.onStreamEvent({
      type: 'thought',
      conversation_id: this.config.id,
      msg_id: uuid(),
      data: { description },
    });
  }

  private emitToolCall(
    toolCallId: string,
    name: string,
    input: Record<string, unknown> | undefined,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): void {
    this.config.onStreamEvent({
      type: 'acp_tool_call',
      conversation_id: this.config.id,
      msg_id: toolCallId,
      data: {
        sessionId: this.replicaId || '',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId,
          status,
          title: titleFromTool(name, input),
          kind: 'execute',
          rawInput: input,
        },
      },
    });
  }

  private emitToolResult(toolCallId: string, output: string, status: 'completed' | 'failed'): void {
    this.config.onStreamEvent({
      type: 'acp_tool_call',
      conversation_id: this.config.id,
      msg_id: toolCallId,
      data: {
        sessionId: this.replicaId || '',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId,
          status,
          content: [{ type: 'content', content: { type: 'text', text: output } }],
        },
      },
    });
  }

  private emitError(error: string): void {
    this.processing = false;
    this.config.onSignalEvent({ type: 'error', conversation_id: this.config.id, msg_id: uuid(), data: error });
    this.config.onSignalEvent({ type: 'finish', conversation_id: this.config.id, msg_id: uuid(), data: null });
  }
}
