/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
};

type StartHandler = (logger: Logger, domain: string) => void | Promise<void>;

type BotInfoResponse = {
  code: number;
  msg?: string;
  bot?: {
    activate_status?: number;
    app_name?: string;
  };
};

const mockControl: {
  startHandler: StartHandler;
  closeSpy: ReturnType<typeof vi.fn> | null;
  tokenResponse: { code: number; msg?: string };
  botInfoResponse: BotInfoResponse;
} = {
  startHandler: (logger) => logger.info('[ws]', 'ws client ready'),
  closeSpy: null,
  tokenResponse: { code: 0, msg: 'ok' },
  botInfoResponse: {
    code: 0,
    msg: 'ok',
    bot: { activate_status: 2, app_name: 'Garza Lord' },
  },
};

function createConfig() {
  const now = Date.now();
  return {
    id: 'lark_default',
    type: 'lark' as const,
    name: 'Lark',
    enabled: true,
    credentials: {
      appId: 'cli_test',
      appSecret: 'secret_test',
    },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadPluginClass() {
  vi.resetModules();

  vi.doMock('@larksuiteoapi/node-sdk', () => {
    class MockClient {
      auth = {
        tenantAccessToken: {
          internal: vi.fn(async () => mockControl.tokenResponse),
        },
      };

      im = {
        message: {
          create: vi.fn(),
          patch: vi.fn(),
        },
      };

      request = vi.fn(async () => mockControl.botInfoResponse);

      constructor(_params: unknown) {}
    }

    class MockEventDispatcher {
      constructor(_params: unknown) {}

      register(_handlers: Record<string, unknown>) {
        return this;
      }
    }

    class MockWSClient {
      private logger: Logger;
      private domain: string;

      constructor(params: { logger: Logger; domain: string }) {
        this.logger = params.logger;
        this.domain = params.domain;
        mockControl.closeSpy = vi.fn();
      }

      async start(_params: { eventDispatcher: MockEventDispatcher }): Promise<void> {
        await mockControl.startHandler(this.logger, this.domain);
      }

      close(params?: { force?: boolean }): void {
        mockControl.closeSpy?.(params);
      }
    }

    return {
      Client: MockClient,
      EventDispatcher: MockEventDispatcher,
      WSClient: MockWSClient,
      AppType: { SelfBuild: 'SelfBuild' },
      Domain: { Feishu: 'Feishu', Lark: 'Lark' },
      LoggerLevel: { info: 'info' },
    };
  });

  const mod = await import('@process/channels/plugins/lark/LarkPlugin');
  return mod.LarkPlugin;
}

describe('LarkPlugin WebSocket startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockControl.closeSpy = null;
    mockControl.startHandler = (logger) => logger.info('[ws]', 'ws client ready');
    mockControl.tokenResponse = { code: 0, msg: 'ok' };
    mockControl.botInfoResponse = {
      code: 0,
      msg: 'ok',
      bot: { activate_status: 2, app_name: 'Garza Lord' },
    };
  });

  it('does not enter running state when SDK reports long-connection startup failure', async () => {
    mockControl.startHandler = (logger) => {
      logger.error('[ws]', 'code: 1000040351, system busy');
      logger.error('[ws]', "Cannot read properties of undefined (reading 'PingInterval')");
    };

    const LarkPlugin = await loadPluginClass();
    const plugin = new LarkPlugin();
    await plugin.initialize(createConfig());

    await expect(plugin.start()).rejects.toThrow(/long connection/i);
    expect(plugin.status).toBe('error');
    expect(mockControl.closeSpy).toHaveBeenCalledWith({ force: true });
  });

  it('enters running state only after SDK readiness settles without startup errors', async () => {
    vi.useFakeTimers();

    const LarkPlugin = await loadPluginClass();
    const plugin = new LarkPlugin();
    await plugin.initialize(createConfig());

    const startPromise = plugin.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    expect(plugin.status).toBe('running');
  });

  it('retries with the Lark international domain when Feishu reports the wrong-domain startup failure', async () => {
    vi.useFakeTimers();

    const domains: string[] = [];
    mockControl.startHandler = (logger, domain) => {
      domains.push(domain);
      if (domain === 'Feishu') {
        logger.error('[ws]', 'code: 1000040351, system busy');
        logger.error('[ws]', "Cannot read properties of undefined (reading 'PingInterval')");
        return;
      }
      logger.info('[ws]', 'ws client ready');
    };

    const LarkPlugin = await loadPluginClass();
    const plugin = new LarkPlugin();
    await plugin.initialize(createConfig());

    const startPromise = plugin.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    expect(domains).toEqual(['Feishu', 'Lark']);
    expect(plugin.status).toBe('running');
  });

  it('force-closes the SDK WebSocket client when stopped', async () => {
    vi.useFakeTimers();

    const LarkPlugin = await loadPluginClass();
    const plugin = new LarkPlugin();
    await plugin.initialize(createConfig());

    const startPromise = plugin.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    await plugin.stop();

    expect(mockControl.closeSpy).toHaveBeenCalledWith({ force: true });
    expect(plugin.status).toBe('stopped');
  });
});

describe('LarkPlugin.testConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockControl.tokenResponse = { code: 0, msg: 'ok' };
    mockControl.botInfoResponse = {
      code: 0,
      msg: 'ok',
      bot: { activate_status: 2, app_name: 'Garza Lord' },
    };
  });

  it('returns the activated bot name from the bot info endpoint', async () => {
    const LarkPlugin = await loadPluginClass();

    const result = await LarkPlugin.testConnection('cli_test', 'secret_test');

    expect(result).toEqual({ success: true, botInfo: { name: 'Garza Lord' } });
  });

  it('fails clearly when bot ability is unavailable or inactive', async () => {
    mockControl.botInfoResponse = {
      code: 0,
      msg: 'ok',
      bot: { activate_status: 1, app_name: 'Garza Lord' },
    };
    const LarkPlugin = await loadPluginClass();

    const result = await LarkPlugin.testConnection('cli_test', 'secret_test');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bot ability is not active/i);
  });
});
