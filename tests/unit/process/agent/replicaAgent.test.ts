import { describe, expect, it } from 'vitest';
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
});
