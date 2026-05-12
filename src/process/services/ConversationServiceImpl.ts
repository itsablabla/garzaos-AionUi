/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationService, CreateConversationParams, MigrateConversationParams } from './IConversationService';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { cronService } from './cron/cronServiceSingleton';
import {
  createGeminiAgent,
  createAcpAgent,
  createOpenClawAgent,
  createNanobotAgent,
  createRemoteAgent,
  createAionrsAgent,
  createReplicaAgent,
} from '@process/utils/initAgent';

/**
 * Concrete implementation of IConversationService.
 * Delegates persistence to an injected IConversationRepository.
 */
export class ConversationServiceImpl implements IConversationService {
  constructor(private readonly repo: IConversationRepository) {}

  private normalizeLegacyReplicaConversation(conversation: TChatConversation): TChatConversation {
    const backend = (conversation.extra as { backend?: string } | undefined)?.backend;
    if (conversation.type !== 'acp' || backend !== 'replica') {
      return conversation;
    }
    return {
      ...conversation,
      type: 'replica',
      extra: {
        ...conversation.extra,
        agentName: conversation.extra.agentName || 'Replicas',
        model: conversation.extra.currentModelId,
      },
    } as TChatConversation;
  }

  async getConversation(id: string): Promise<TChatConversation | undefined> {
    const conversation = await this.repo.getConversation(id);
    return conversation ? this.normalizeLegacyReplicaConversation(conversation) : undefined;
  }

  async listAllConversations(): Promise<TChatConversation[]> {
    const conversations = await this.repo.listAllConversations();
    return conversations.map((conversation) => this.normalizeLegacyReplicaConversation(conversation));
  }

  async getConversationsByCronJob(cronJobId: string): Promise<TChatConversation[]> {
    const conversations = await this.repo.getConversationsByCronJob(cronJobId);
    return conversations.map((conversation) => this.normalizeLegacyReplicaConversation(conversation));
  }

  async deleteConversation(id: string): Promise<void> {
    await this.repo.deleteConversation(id);
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void> {
    let finalUpdates = updates;
    if (mergeExtra && updates.extra) {
      const existing = await this.repo.getConversation(id);
      if (existing) {
        finalUpdates = {
          ...updates,
          extra: { ...existing.extra, ...updates.extra },
        } as Partial<TChatConversation>;
      }
    }
    await this.repo.updateConversation(id, finalUpdates);
  }

  async createWithMigration(params: MigrateConversationParams): Promise<TChatConversation> {
    const { conversation, sourceConversationId, migrateCron } = params;
    const conv: TChatConversation = {
      ...conversation,
      createTime: conversation.createTime ?? Date.now(),
      modifyTime: conversation.modifyTime ?? Date.now(),
    };
    await this.repo.createConversation(conv);

    if (sourceConversationId) {
      // Copy all messages from source conversation
      const pageSize = 10000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: messages, hasMore: more } = await this.repo.getMessages(sourceConversationId, page, pageSize);
        for (const msg of messages) {
          await this.repo.insertMessage({
            ...msg,
            id: uuid(),
            conversation_id: conv.id,
          });
        }
        hasMore = more;
        page++;
      }

      // Migrate or delete cron jobs associated with source conversation
      try {
        const jobs = await cronService.listJobsByConversation(sourceConversationId);
        if (migrateCron) {
          for (const job of jobs) {
            await cronService.updateJob(job.id, {
              metadata: {
                ...job.metadata,
                conversationId: conv.id,
                conversationTitle: conv.name,
              },
            });
          }
        } else {
          for (const job of jobs) {
            await cronService.removeJob(job.id);
          }
        }
      } catch (err) {
        console.error('[ConversationServiceImpl] Failed to handle cron jobs during migration:', err);
      }

      // Integrity check: only delete source if message counts match
      const sourceMsgs = await this.repo.getMessages(sourceConversationId, 0, 1);
      const newMsgs = await this.repo.getMessages(conv.id, 0, 1);
      if (sourceMsgs.total === newMsgs.total) {
        await this.repo.deleteConversation(sourceConversationId);
      } else {
        console.error('[ConversationServiceImpl] Migration integrity check failed: message counts do not match.', {
          source: sourceMsgs.total,
          new: newMsgs.total,
        });
      }
    }

    return conv;
  }

  async createConversation(params: CreateConversationParams): Promise<TChatConversation> {
    let conversation: TChatConversation;
    const normalizedParams =
      params.type === 'acp' && params.extra?.backend === 'replica' ? { ...params, type: 'replica' as const } : params;

    switch (normalizedParams.type) {
      case 'gemini': {
        conversation = await createGeminiAgent(
          normalizedParams.model,
          normalizedParams.extra.workspace,
          normalizedParams.extra.defaultFiles as string[] | undefined,
          normalizedParams.extra.webSearchEngine,
          normalizedParams.extra.customWorkspace,
          normalizedParams.extra.contextFileName,
          normalizedParams.extra.presetRules,
          normalizedParams.extra.enabledSkills as string[] | undefined,
          normalizedParams.extra.presetAssistantId,
          normalizedParams.extra.sessionMode,
          normalizedParams.extra.isHealthCheck,
          normalizedParams.extra.extraSkillPaths as string[] | undefined,
          normalizedParams.extra.excludeBuiltinSkills as string[] | undefined
        );
        break;
      }
      case 'acp': {
        conversation = await createAcpAgent(normalizedParams as any);
        break;
      }
      case 'openclaw-gateway': {
        conversation = await createOpenClawAgent(normalizedParams as any);
        break;
      }
      case 'nanobot': {
        conversation = await createNanobotAgent(normalizedParams as any);
        break;
      }
      case 'remote': {
        conversation = await createRemoteAgent(normalizedParams as any);
        break;
      }
      case 'replica': {
        conversation = await createReplicaAgent(normalizedParams as any);
        break;
      }
      case 'aionrs': {
        conversation = await createAionrsAgent(normalizedParams as any);
        break;
      }
      default: {
        throw new Error(`Invalid conversation type: ${(normalizedParams as any).type}`);
      }
    }

    // Apply optional overrides without mutating the object returned by agent factories
    const overrides: Partial<TChatConversation> = {};
    if (normalizedParams.id) overrides.id = normalizedParams.id;
    if (normalizedParams.name) overrides.name = normalizedParams.name;
    if (normalizedParams.source) overrides.source = normalizedParams.source;
    if (normalizedParams.channelChatId) overrides.channelChatId = normalizedParams.channelChatId;
    // Merge extra fields from params that the factory didn't consume (e.g. cronJobId).
    // Factory-produced values take precedence; only novel keys from params.extra are added.
    if (normalizedParams.extra && conversation.extra) {
      const factoryExtra = conversation.extra as Record<string, unknown>;
      for (const [key, value] of Object.entries(normalizedParams.extra)) {
        if (value !== undefined && !(key in factoryExtra)) {
          factoryExtra[key] = value;
        }
      }
    }

    // The spread preserves the discriminant field (type) from `conversation`;
    // the assertion is safe because `overrides` only contains non-discriminant fields.
    const finalConversation = {
      ...conversation,
      ...overrides,
    } as TChatConversation;

    await this.repo.createConversation(finalConversation);
    return finalConversation;
  }
}
