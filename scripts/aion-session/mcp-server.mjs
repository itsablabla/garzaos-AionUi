#!/usr/bin/env node
/**
 * Native AionUI Session MCP server.
 *
 * Exposes AionUI WebSocket conversation/session operations as MCP tools so new
 * agents can list, inspect, search, create, message, and delete sessions without
 * shelling into bespoke scripts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WebSocket } from 'ws';

const DEFAULT_WS_URL = process.env.AIONUI_WS_URL || 'ws://localhost:25808/';
const DEFAULT_TIMEOUT_MS = Number(process.env.AIONUI_TIMEOUT_MS || '30000');
const COOKIE_FILE = process.env.AIONUI_COOKIE_FILE || path.join(os.homedir(), '.aionui_cookies.json');
const COOKIE_BASE = 'multica_logged_in=1; sidebar_state=true';

function readSavedCookies() {
  if (!fs.existsSync(COOKIE_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    return {
      sessionToken: typeof parsed.session_token === 'string' ? parsed.session_token : undefined,
      csrfToken: typeof parsed.csrf_token === 'string' ? parsed.csrf_token : undefined,
    };
  } catch {
    return {};
  }
}

function getTokens() {
  const saved = readSavedCookies();
  return {
    sessionToken: process.env.AIONUI_SESSION_TOKEN || saved.sessionToken,
    csrfToken: process.env.AIONUI_CSRF_TOKEN || saved.csrfToken,
  };
}

function buildCookieHeader() {
  const tokens = getTokens();
  const parts = [COOKIE_BASE];
  if (tokens.sessionToken) parts.push(`aionui-session=${tokens.sessionToken}`);
  if (tokens.csrfToken) parts.push(`csrfToken=${tokens.csrfToken}`);
  return parts.join('; ');
}

function callbackNameFor(name, id) {
  return `subscribe.callback-${name.replace('subscribe-', '')}${id}`;
}

function makeRequestId(prefix) {
  return `${prefix}${crypto.randomBytes(4).toString('hex')}`;
}

class AionWsClient {
  constructor({ wsUrl = DEFAULT_WS_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.wsUrl = wsUrl;
    this.timeoutMs = timeoutMs;
    this.ws = null;
  }

  async connect() {
    this.ws = await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          Origin: this.wsUrl.replace(/^ws/, 'http').replace(/\/$/, ''),
          Cookie: buildCookieHeader(),
          'User-Agent': 'AionUI-Session-MCP/1.0',
        },
      });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error(`Timed out connecting to ${this.wsUrl}`));
      }, this.timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      ws.once('close', (code, reason) => {
        if (code !== 1000 && ws.readyState !== WebSocket.OPEN) {
          clearTimeout(timer);
          reject(new Error(`WebSocket closed during auth (${code}): ${reason.toString() || 'no reason'}`));
        }
      });
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async request(name, data, prefix = name.replace('subscribe-', '')) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const id = makeRequestId(prefix);
    const expected = callbackNameFor(name, id);
    const request = { name, data: { id, data } };

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${expected}`));
      }, this.timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.ws?.off('message', onMessage);
        this.ws?.off('error', onError);
        this.ws?.off('close', onClose);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onClose = (code, reason) => {
        cleanup();
        reject(new Error(`WebSocket closed (${code}): ${reason.toString() || 'no reason'}`));
      };
      const onMessage = (raw) => {
        let decoded;
        try {
          decoded = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (decoded?.name !== expected) return;
        cleanup();
        resolve(decoded.data ?? decoded);
      };

      this.ws.on('message', onMessage);
      this.ws.once('error', onError);
      this.ws.once('close', onClose);
      this.ws.send(JSON.stringify(request), (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }

  async sendFireAndForget(name, data, prefix = name.replace('subscribe-', '')) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const id = makeRequestId(prefix);
    const request = { name, data: { id, data } };
    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(request), (error) => (error ? reject(error) : resolve()));
    });
    return { status: 'dispatched', request_id: id };
  }
}

async function withClient(args, fn) {
  const client = new AionWsClient({ wsUrl: args.ws_url || DEFAULT_WS_URL });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.close();
  }
}

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function buildConversationPayload(args) {
  const orgExtra = {};
  if (args.org_workspace_id) orgExtra.workspace_id = args.org_workspace_id;
  if (args.org_project_id) orgExtra.project_id = args.org_project_id;

  if (args.type === 'aionrs') {
    if (!args.model) throw new Error('model is required for type=aionrs');
    return {
      type: 'aionrs',
      name: args.name,
      model: args.model,
      extra: {
        workspace: args.workspace || '',
        customWorkspace: Boolean(args.workspace),
        defaultFiles: [],
        sessionMode: args.session_mode || 'default',
        ...orgExtra,
      },
    };
  }

  const backend = args.backend || 'codex';
  return {
    type: 'acp',
    name: args.name,
    extra: {
      workspace: args.workspace || '',
      customWorkspace: Boolean(args.workspace),
      defaultFiles: [],
      backend,
      agentName: args.agent_name || backend,
      cliPath: args.cli_path || backend,
      sessionMode: args.session_mode || 'default',
      ...orgExtra,
    },
  };
}

function flattenMessageText(message) {
  const content = message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content?.content === 'string') return content.content;
  if (typeof content?.text === 'string') return content.text;
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content?.text || item?.content || '')
      .filter((item) => typeof item === 'string')
      .join('\n');
  }
  return JSON.stringify(content);
}

async function main() {
  const server = new McpServer({ name: 'aionui-session-control', version: '1.0.0' });

  const wsUrlSchema = z.string().optional().describe('AionUI WebSocket URL. Defaults to AIONUI_WS_URL or ws://localhost:25808/. Use ws://localhost:25809/ for dev WebUI.');

  server.tool(
    'aion_list_sessions',
    'List AionUI conversations visible to the authenticated WebUI user, including org project/workspace metadata in conversation.extra.',
    { ws_url: wsUrlSchema, page: z.number().int().nonnegative().optional(), page_size: z.number().int().positive().max(10000).optional() },
    async (args) => textResult(await withClient(args, (client) => client.request('subscribe-database.get-user-conversations', { page: args.page ?? 0, pageSize: args.page_size ?? 10000 })))
  );

  server.tool(
    'aion_get_session_messages',
    'Read the actual stored message text/events for a conversation. Use this to inspect what happened in another session.',
    { ws_url: wsUrlSchema, conversation_id: z.string(), page: z.number().int().nonnegative().optional(), page_size: z.number().int().positive().max(10000).optional(), text_only: z.boolean().optional() },
    async (args) => {
      const messages = await withClient(args, (client) =>
        client.request('subscribe-database.get-conversation-messages', {
          conversation_id: args.conversation_id,
          page: args.page ?? 0,
          pageSize: args.page_size ?? 1000,
        })
      );
      if (!args.text_only) return textResult(messages);
      const normalized = (Array.isArray(messages) ? messages : []).map((message) => ({
        id: message.id || message.msg_id,
        type: message.type,
        position: message.position,
        createTime: message.createTime,
        text: flattenMessageText(message),
      }));
      return textResult(normalized);
    }
  );

  server.tool(
    'aion_search_session_text',
    'Search indexed conversation message text across AionUI sessions using the app database search provider.',
    { ws_url: wsUrlSchema, keyword: z.string().min(1), page: z.number().int().nonnegative().optional(), page_size: z.number().int().positive().max(1000).optional() },
    async (args) => textResult(await withClient(args, (client) => client.request('subscribe-database.search-conversation-messages', { keyword: args.keyword, page: args.page ?? 0, pageSize: args.page_size ?? 20 })))
  );

  server.tool(
    'aion_create_session',
    'Create a new AionUI conversation/session. Supports org_workspace_id and org_project_id for Msty-style Projects.',
    {
      ws_url: wsUrlSchema,
      name: z.string().min(1),
      type: z.enum(['acp', 'aionrs']).optional(),
      backend: z.string().optional(),
      agent_name: z.string().optional(),
      cli_path: z.string().optional(),
      workspace: z.string().optional(),
      session_mode: z.enum(['default', 'bypassPermissions', 'yolo']).optional(),
      org_workspace_id: z.string().optional(),
      org_project_id: z.string().optional(),
      model: z.record(z.unknown()).optional(),
    },
    async (args) => textResult(await withClient(args, (client) => client.request('subscribe-create-conversation', buildConversationPayload({ type: args.type ?? 'acp', ...args }), 'create-conversation')))
  );

  server.tool(
    'aion_send_message',
    'Dispatch a prompt/message into an existing AionUI session by conversation_id. Fire-and-forget; inspect output with aion_get_session_messages later.',
    { ws_url: wsUrlSchema, conversation_id: z.string(), message: z.string().min(1), files: z.array(z.unknown()).optional() },
    async (args) => textResult(await withClient(args, (client) => client.sendFireAndForget('subscribe-chat.send.message', { input: args.message, msg_id: crypto.randomBytes(4).toString('hex'), conversation_id: args.conversation_id, files: args.files ?? [] }, 'chat.send.message')))
  );

  server.tool(
    'aion_delete_session',
    'Delete an AionUI conversation/session by ID. Requires confirm=true as a guardrail.',
    { ws_url: wsUrlSchema, conversation_id: z.string(), confirm: z.boolean() },
    async (args) => {
      if (!args.confirm) throw new Error('Refusing to delete session unless confirm=true');
      return textResult(await withClient(args, (client) => client.request('subscribe-remove-conversation', { id: args.conversation_id }, 'remove-conversation')));
    }
  );

  server.tool(
    'aion_batch_dispatch',
    'Create or reuse multiple sessions and dispatch prompts. Use for scalable multi-agent review/control. Existing sessions use tasks[].id; new sessions use tasks[].name.',
    {
      ws_url: wsUrlSchema,
      defaults: z.record(z.unknown()).optional(),
      tasks: z.array(z.record(z.unknown())).min(1),
      create_only: z.boolean().optional(),
    },
    async (args) => {
      const results = [];
      for (const [index, rawTask] of args.tasks.entries()) {
        const task = { ...(args.defaults ?? {}), ...rawTask };
        const ws_url = task.ws_url || args.ws_url;
        const result = { task_index: index, name: task.name, requested_id: task.id, created: false, sent: false, status: 'ok' };
        try {
          await withClient({ ws_url }, async (client) => {
            let conversationId = task.id;
            if (!conversationId) {
              if (!task.name) throw new Error('Task requires name when id is not provided');
              const created = await client.request('subscribe-create-conversation', buildConversationPayload({ type: task.type ?? 'acp', ...task }), 'create-conversation');
              result.created = true;
              result.create_response = created;
              conversationId = created?.id || created?.data?.id || created?.data?.conversation_id || created?.conversation_id;
              result.conversation_id = conversationId;
              if (!conversationId && !args.create_only) throw new Error('Could not extract conversation id from create response');
            } else {
              result.conversation_id = conversationId;
            }
            if (!args.create_only) {
              if (!task.message) throw new Error('Task requires message unless create_only=true');
              result.send_response = await client.sendFireAndForget('subscribe-chat.send.message', {
                input: String(task.message),
                msg_id: crypto.randomBytes(4).toString('hex'),
                conversation_id: String(conversationId),
                files: Array.isArray(task.files) ? task.files : [],
              }, 'chat.send.message');
              result.sent = true;
            }
          });
        } catch (error) {
          result.status = 'error';
          result.error = error instanceof Error ? error.message : String(error);
        }
        results.push(result);
      }
      return textResult({ results });
    }
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('[AionSessionMCP] Fatal error:', error);
  process.exit(1);
});
