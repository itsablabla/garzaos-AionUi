import type { IResponseMessage } from '@/common/adapter/ipcBridge';

export type ReplicaCodingAgent = 'claude' | 'codex';
export type ReplicaThinkingLevel = 'low' | 'medium' | 'high' | 'max';

export const DEFAULT_REPLICA_MODEL = 'claude-opus-4-7';

export function resolveReplicaCodingAgent(model: string | undefined): ReplicaCodingAgent {
  if (!model) return 'claude';
  const normalized = model.toLowerCase();
  if (normalized.startsWith('gpt') || normalized.includes('codex')) return 'codex';
  return 'claude';
}

export type ReplicaAgentConfig = {
  id: string;
  workingDir: string;
  apiKey?: string;
  apiBaseUrl?: string;
  replicaId?: string;
  chatId?: string;
  environmentId?: string;
  model?: string;
  codingAgent?: ReplicaCodingAgent;
  thinkingLevel?: ReplicaThinkingLevel;
  planMode?: boolean;
  onStreamEvent: (message: IResponseMessage) => void;
  onSignalEvent: (message: IResponseMessage) => void;
  onReplicaIdUpdate?: (replicaId: string) => void;
  onChatIdUpdate?: (chatId: string) => void;
};

export type CreateReplicaResponse = {
  replica: {
    id: string;
    name: string;
    status: string;
  };
};

export type SendReplicaMessageResponse = {
  status: 'sent' | 'queued' | 'waking';
  message_id: string | null;
  position: number | null;
  chat_id: string | null;
};

export type ReplicaEngineEvent = {
  id?: string;
  ts?: string;
  type: string;
  payload?: Record<string, unknown> & {
    chatId?: string;
    messageId?: string;
    message?: string;
    event?: ReplicaAgentEvent;
  };
};

type ClaudeContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'thinking'; text?: string }
  | { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id?: string;
      content?: string | Array<{ type?: string; text?: string }>;
      is_error?: boolean;
    };

export type ReplicaAgentEvent = {
  timestamp?: string;
  type: string;
  payload?: {
    type?: string;
    subtype?: string;
    is_error?: boolean;
    errors?: string[];
    message?: {
      content?: ClaudeContentBlock[];
    };
    content?: Array<{ type?: string; text?: string }>;
    text?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    input?: string;
    output?: string;
    status?: string;
  };
};
