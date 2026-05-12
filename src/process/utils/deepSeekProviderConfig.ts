/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConfigStorageRefer, IProvider } from '@/common/config/storage';

export const DEEPSEEK_PROVIDER_ID = 'builtin-openrouter-deepseek';
export const DEEPSEEK_MODEL_ID = 'deepseek/deepseek-chat-v3.1';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_ENV_KEYS = ['OPENROUTER_API_KEY', 'DEEPSEEK_OPENROUTER_API_KEY', 'AIONUI_DEEPSEEK_API_KEY'] as const;

type ConfigStore = {
  get<K extends keyof IConfigStorageRefer>(key: K): Promise<IConfigStorageRefer[K]>;
  set<K extends keyof IConfigStorageRefer>(key: K, value: IConfigStorageRefer[K]): Promise<IConfigStorageRefer[K]>;
};

export function readDeepSeekApiKey(): string {
  for (const key of DEEPSEEK_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function buildGooseDeepSeekEnv(): Record<string, string> {
  const apiKey = readDeepSeekApiKey();
  if (!apiKey) return {};
  return {
    GOOSE_PROVIDER: 'openrouter',
    GOOSE_MODEL: DEEPSEEK_MODEL_ID,
    OPENROUTER_API_KEY: apiKey,
  };
}

function createDeepSeekProvider(apiKey: string): IProvider {
  return {
    id: DEEPSEEK_PROVIDER_ID,
    platform: 'custom',
    name: 'DeepSeek',
    baseUrl: OPENROUTER_BASE_URL,
    apiKey,
    model: [DEEPSEEK_MODEL_ID],
    enabled: true,
    modelEnabled: {
      [DEEPSEEK_MODEL_ID]: true,
    },
    capabilities: [
      { type: 'text' },
      { type: 'function_calling' },
      { type: 'reasoning' },
    ],
    contextLimit: 128_000,
  };
}

/**
 * Ensures a DeepSeek-on-OpenRouter provider exists when an API key is supplied
 * through the process environment. This makes the model available to provider-
 * backed agents (Aion CLI, Gemini provider fallback, team model lists, and
 * channel integrations) without committing secrets to the repository.
 */
export async function ensureDeepSeekProviderConfig(configStore: ConfigStore): Promise<void> {
  const apiKey = readDeepSeekApiKey();
  if (!apiKey) return;

  const existingProviders = (await configStore.get('model.config').catch((): IProvider[] => [])) || [];
  const existingIndex = existingProviders.findIndex((provider) => provider.id === DEEPSEEK_PROVIDER_ID);
  const nextProvider = createDeepSeekProvider(apiKey);

  if (existingIndex === -1) {
    await configStore.set('model.config', [nextProvider, ...existingProviders]);
    return;
  }

  const existing = existingProviders[existingIndex];
  const existingModels = Array.isArray(existing.model) ? existing.model : [];
  const model = existingModels.includes(DEEPSEEK_MODEL_ID) ? existingModels : [DEEPSEEK_MODEL_ID, ...existingModels];
  const nextProviders = [...existingProviders];
  nextProviders[existingIndex] = {
    ...existing,
    name: existing.name || nextProvider.name,
    platform: existing.platform || nextProvider.platform,
    baseUrl: existing.baseUrl || nextProvider.baseUrl,
    apiKey: existing.apiKey || apiKey,
    model,
    enabled: existing.enabled ?? true,
    modelEnabled: {
      ...existing.modelEnabled,
      [DEEPSEEK_MODEL_ID]: existing.modelEnabled?.[DEEPSEEK_MODEL_ID] ?? true,
    },
  };

  await configStore.set('model.config', nextProviders);
}
