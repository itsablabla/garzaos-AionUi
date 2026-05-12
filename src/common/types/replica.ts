export type ReplicaCodingAgent = 'claude' | 'codex';
export type ReplicaThinkingLevel = 'low' | 'medium' | 'high' | 'max';

export const DEFAULT_REPLICA_MODEL = 'claude-opus-4-7';

export function resolveReplicaCodingAgent(model: string | undefined): ReplicaCodingAgent {
  if (!model) return 'claude';
  const normalized = model.toLowerCase();
  if (normalized.startsWith('gpt') || normalized.includes('codex')) return 'codex';
  return 'claude';
}
