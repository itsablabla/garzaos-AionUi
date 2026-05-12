/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import {
  filterSessionsForCenter,
  filterSessionsByTitle,
  getSessionCategory,
  isVisibleSession,
  sortSessionsForCenter,
  splitSessionsIntoRecentAndArchive,
} from '@/renderer/pages/sessions/utils';
import { describe, expect, it } from 'vitest';

const createConversation = (id: string, overrides: Partial<TChatConversation> = {}): TChatConversation => ({
  createTime: 1,
  modifyTime: 1,
  name: id,
  id,
  type: 'gemini',
  extra: {},
  model: {
    id: 'model-1',
    name: 'Gemini',
    useModel: 'gemini-2.0-flash',
    platform: 'gemini',
    baseUrl: '',
    apiKey: '',
  } as TChatConversation['model'],
  ...overrides,
});

describe('sessions center helpers', () => {
  it('sorts pinned first, favorites second, then by modification time', () => {
    const sorted = sortSessionsForCenter([
      createConversation('normal-newer', { modifyTime: 40 }),
      createConversation('favorite', { modifyTime: 10, extra: { favorited: true } as TChatConversation['extra'] }),
      createConversation('pinned', { modifyTime: 5, extra: { pinned: true } as TChatConversation['extra'] }),
      createConversation('normal-older', { modifyTime: 20 }),
    ]);

    expect(sorted.map((conversation) => conversation.id)).toEqual([
      'pinned',
      'favorite',
      'normal-newer',
      'normal-older',
    ]);
  });

  it('filters sessions by title and excludes health-check sessions', () => {
    const conversations = [
      createConversation('alpha', { name: 'Alpha project' }),
      createConversation('beta', { name: 'Beta project' }),
      createConversation('health', { extra: { isHealthCheck: true } as TChatConversation['extra'] }),
    ];

    expect(conversations.filter(isVisibleSession).map((conversation) => conversation.id)).toEqual(['alpha', 'beta']);
    expect(filterSessionsByTitle(conversations, 'alpha').map((conversation) => conversation.id)).toEqual(['alpha']);
  });

  it('filters by category, favorite state, team state, backend, and date', () => {
    const conversations = [
      createConversation('code-favorite', {
        createTime: Date.UTC(2026, 4, 12),
        extra: { sessionKind: 'code', favorited: true, backend: 'claude' } as TChatConversation['extra'],
      }),
      createConversation('team-plan', {
        createTime: Date.UTC(2026, 4, 11),
        extra: { sessionKind: 'plan', teamId: 'team-1', backend: 'codex' } as TChatConversation['extra'],
      }),
    ];

    expect(getSessionCategory(conversations[0])).toBe('code');
    expect(
      filterSessionsForCenter(conversations, {
        query: '',
        backend: 'claude',
        status: 'favorite',
        category: 'code',
        date: '2026-05-12',
      }).map((conversation) => conversation.id)
    ).toEqual(['code-favorite']);
    expect(
      filterSessionsForCenter(conversations, {
        query: '',
        backend: 'all',
        status: 'team',
        category: 'all',
        date: '',
      }).map((conversation) => conversation.id)
    ).toEqual(['team-plan']);
  });

  it('keeps the latest ten sessions visible and archives older sessions by create date', () => {
    const conversations = Array.from({ length: 12 }, (_, index) =>
      createConversation(`conv-${index}`, {
        createTime: new Date(`2026-05-${String(index < 11 ? 10 : 9).padStart(2, '0')}T00:00:00Z`).getTime(),
        modifyTime: 100 - index,
      })
    );

    const { recent, folders } = splitSessionsIntoRecentAndArchive(conversations);

    expect(recent).toHaveLength(10);
    expect(folders.map((folder) => [folder.key, folder.count])).toEqual([
      ['2026-05-10', 1],
      ['2026-05-09', 1],
    ]);
  });
});
