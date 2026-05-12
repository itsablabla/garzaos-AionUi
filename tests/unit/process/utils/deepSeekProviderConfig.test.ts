import { describe, expect, it, afterEach, vi } from 'vitest';
import type { IConfigStorageRefer } from '@/common/config/storage';
import {
  DEEPSEEK_MODEL_ID,
  DEEPSEEK_PROVIDER_ID,
  buildGooseDeepSeekEnv,
  ensureDeepSeekProviderConfig,
} from '@process/utils/deepSeekProviderConfig';

function createStore(initial: Partial<IConfigStorageRefer> = {}) {
  const data: Partial<IConfigStorageRefer> = { ...initial };
  return {
    data,
    get: vi.fn(async (key: keyof IConfigStorageRefer) => data[key]),
    set: vi.fn(async (key: keyof IConfigStorageRefer, value: IConfigStorageRefer[keyof IConfigStorageRefer]) => {
      data[key] = value as never;
      return value;
    }),
  };
}

describe('ensureDeepSeekProviderConfig', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEEPSEEK_OPENROUTER_API_KEY;
    delete process.env.AIONUI_DEEPSEEK_API_KEY;
  });

  it('does nothing when no API key is configured', async () => {
    const store = createStore();

    await ensureDeepSeekProviderConfig(store);

    expect(store.set).not.toHaveBeenCalled();
  });

  it('prepends DeepSeek provider when an OpenRouter key is configured', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const store = createStore({
      'model.config': [
        {
          id: 'existing',
          platform: 'custom',
          name: 'Existing',
          baseUrl: 'https://example.com/v1',
          apiKey: 'existing-key',
          model: ['existing-model'],
        },
      ],
    });

    await ensureDeepSeekProviderConfig(store);

    const providers = store.data['model.config'];
    expect(providers?.[0]).toMatchObject({
      id: DEEPSEEK_PROVIDER_ID,
      name: 'DeepSeek',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: [DEEPSEEK_MODEL_ID],
      enabled: true,
    });
    expect(providers?.[1]?.id).toBe('existing');
  });

  it('updates an existing built-in provider without overwriting user key', async () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    const store = createStore({
      'model.config': [
        {
          id: DEEPSEEK_PROVIDER_ID,
          platform: 'custom',
          name: 'DeepSeek Custom',
          baseUrl: '',
          apiKey: 'user-key',
          model: ['other-model'],
          enabled: false,
        },
      ],
    });

    await ensureDeepSeekProviderConfig(store);

    const provider = store.data['model.config']?.[0];
    expect(provider?.apiKey).toBe('user-key');
    expect(provider?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(provider?.model).toEqual([DEEPSEEK_MODEL_ID, 'other-model']);
    expect(provider?.enabled).toBe(false);
  });

  it('builds Goose OpenRouter environment from the configured key', () => {
    process.env.OPENROUTER_API_KEY = 'goose-key';

    expect(buildGooseDeepSeekEnv()).toEqual({
      GOOSE_PROVIDER: 'openrouter',
      GOOSE_MODEL: DEEPSEEK_MODEL_ID,
      OPENROUTER_API_KEY: 'goose-key',
    });
  });
});
