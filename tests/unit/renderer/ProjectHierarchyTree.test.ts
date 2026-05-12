/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { buildConversationLookup } from '@/renderer/pages/conversation/GroupedHistory/ProjectHierarchyTree';
import { describe, expect, it } from 'vitest';

const createConversation = (
  id: string,
  workspace: string,
  projectFolderId: string | undefined,
  modifyTime: number
): TChatConversation =>
  ({
    id,
    createTime: modifyTime - 1,
    modifyTime,
    name: id,
    type: 'gemini',
    extra: {
      workspace,
      customWorkspace: true,
      projectFolderId,
    },
  }) as TChatConversation;

describe('buildConversationLookup', () => {
  it('groups project conversations by explicit folder id and sorts by recent activity', () => {
    const lookup = buildConversationLookup([
      createConversation('older', '/repo/a', 'folder-1', 10),
      createConversation('newer', '/repo/a', 'folder-1', 20),
      createConversation('other', '/repo/b', 'folder-2', 30),
    ]);

    expect(lookup.get('folder-1')?.map((conversation) => conversation.id)).toEqual(['newer', 'older']);
    expect(lookup.get('folder-2')?.map((conversation) => conversation.id)).toEqual(['other']);
  });

  it('falls back to encoded workspace folder id for backfilled conversations', () => {
    const lookup = buildConversationLookup([createConversation('workspace-conversation', '/repo/a b', undefined, 10)]);

    expect(lookup.get('workspace:%2Frepo%2Fa%20b')?.map((conversation) => conversation.id)).toEqual([
      'workspace-conversation',
    ]);
  });

  it('ignores conversations without custom workspace data', () => {
    const lookup = buildConversationLookup([
      {
        ...createConversation('missing-workspace', '', 'folder-1', 10),
        extra: { customWorkspace: true },
      } as TChatConversation,
      {
        ...createConversation('not-custom', '/repo/a', 'folder-1', 20),
        extra: { workspace: '/repo/a' },
      } as TChatConversation,
    ]);

    expect(lookup.size).toBe(0);
  });
});
