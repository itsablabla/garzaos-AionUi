import { afterEach, describe, expect, it } from 'vitest';
import { ReplicaAgent } from '../../../../src/process/agent/replica';
import type { IResponseMessage } from '../../../../src/common/adapter/ipcBridge';

function createAgent(events: IResponseMessage[] = []): ReplicaAgent {
  return new ReplicaAgent({
    id: 'conv-1',
    workingDir: '/tmp',
    apiKey: 'test-key',
    onStreamEvent: (message) => events.push(message),
    onSignalEvent: (message) => events.push(message),
  });
}

describe('ReplicaAgent event translation', () => {
  afterEach(() => {
    delete process.env.REPLICAS_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_KEY;
  });

  it('emits Codex reasoning text from event_msg payloads', () => {
    const events: IResponseMessage[] = [];
    const agent = createAgent(events);

    (agent as unknown as { handleEngineEvent: (event: unknown) => void }).handleEngineEvent({
      type: 'chat.turn.delta',
      payload: {
        event: {
          type: 'event_msg',
          payload: { type: 'agent_reasoning', text: 'checking repository state' },
        },
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'thought',
      conversation_id: 'conv-1',
      data: { description: 'checking repository state' },
    });
  });

  it('persists chat ids from engine turn events before follow-up messages', () => {
    let savedChatId: string | undefined;
    const agent = new ReplicaAgent({
      id: 'conv-1',
      workingDir: '/tmp',
      apiKey: 'test-key',
      onStreamEvent: () => {},
      onSignalEvent: () => {},
      onChatIdUpdate: (chatId) => {
        savedChatId = chatId;
      },
    });

    (agent as unknown as { handleEngineEvent: (event: unknown) => void }).handleEngineEvent({
      type: 'chat.turn.accepted',
      payload: { chatId: 'chat-1', messageId: 'message-1', queued: false, position: 0 },
    });

    expect(agent.currentChatId).toBe('chat-1');
    expect(savedChatId).toBe('chat-1');
  });

  it('passes agent model when creating a replica', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/v1/replica')) {
        requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      }
      return new Response(JSON.stringify({ replica: { id: 'replica-1', name: 'test', status: 'preparing' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const agent = new ReplicaAgent({
        id: 'conv-1',
        workingDir: '/tmp',
        apiKey: 'test-key',
        codingAgent: 'claude',
        model: 'claude-opus-4-7',
        thinkingLevel: 'max',
        onStreamEvent: () => {},
        onSignalEvent: () => {},
      });

      await agent.sendMessage({ content: 'hello' });

      expect(requestBody).toMatchObject({
        message: 'hello',
        coding_agent: 'claude',
        model: 'claude-opus-4-7',
        thinking_level: 'max',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses Replicas environment configuration when creating a replica', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      environmentId: process.env.REPLICAS_ENVIRONMENT_ID,
      repositorySetId: process.env.REPLICAS_REPOSITORY_SET_ID,
      repositoryIds: process.env.REPLICAS_REPOSITORY_IDS,
    };
    let requestBody: Record<string, unknown> | undefined;
    process.env.REPLICAS_ENVIRONMENT_ID = 'env-1';
    process.env.REPLICAS_REPOSITORY_SET_ID = 'repo-set-1';
    process.env.REPLICAS_REPOSITORY_IDS = 'repo-1, repo-2';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/v1/replica')) {
        requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      }
      return new Response(JSON.stringify({ replica: { id: 'replica-1', name: 'test', status: 'preparing' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const agent = new ReplicaAgent({
        id: 'conv-1',
        workingDir: '/tmp',
        apiKey: 'test-key',
        onStreamEvent: () => {},
        onSignalEvent: () => {},
      });

      await agent.sendMessage({ content: 'hello' });

      expect(requestBody).toMatchObject({
        environment_id: 'env-1',
        repository_set_id: 'repo-set-1',
        repository_ids: ['repo-1', 'repo-2'],
      });
    } finally {
      globalThis.fetch = originalFetch;
      process.env.REPLICAS_ENVIRONMENT_ID = originalEnv.environmentId;
      process.env.REPLICAS_REPOSITORY_SET_ID = originalEnv.repositorySetId;
      process.env.REPLICAS_REPOSITORY_IDS = originalEnv.repositoryIds;
    }
  });

  it('accepts Replicate API token aliases from the environment', async () => {
    process.env.REPLICATE_API_TOKEN = 'replicate-token';
    const originalFetch = globalThis.fetch;
    let authHeader: string | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get('authorization');
      return new Response(JSON.stringify({ replica: { id: 'replica-1', name: 'test', status: 'preparing' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const agent = new ReplicaAgent({
        id: 'conv-1',
        workingDir: '/tmp',
        onStreamEvent: () => {},
        onSignalEvent: () => {},
      });

      await agent.sendMessage({ content: 'hello' });

      expect(authHeader).toBe('Bearer replicate-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
