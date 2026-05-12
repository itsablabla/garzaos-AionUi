/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { SqliteProjectHierarchyRepository } from '@process/services/database/SqliteProjectHierarchyRepository';

const repository = new SqliteProjectHierarchyRepository();

export function initProjectHierarchyBridge(): void {
  ipcBridge.projectHierarchy.list.provider(async () => repository.listHierarchy());
  ipcBridge.projectHierarchy.createGroup.provider(async (params) => repository.createGroup(params));
  ipcBridge.projectHierarchy.updateGroup.provider(async ({ groupId, updates }) =>
    repository.updateGroup(groupId, updates)
  );
  ipcBridge.projectHierarchy.deleteGroup.provider(async ({ groupId }) => repository.deleteGroup(groupId));
  ipcBridge.projectHierarchy.reorderGroups.provider(async ({ groupIds }) => repository.reorderGroups(groupIds));
  ipcBridge.projectHierarchy.createFolder.provider(async (params) => repository.createFolder(params));
  ipcBridge.projectHierarchy.updateFolder.provider(async ({ folderId, updates }) =>
    repository.updateFolder(folderId, updates)
  );
  ipcBridge.projectHierarchy.deleteFolder.provider(async ({ folderId }) => repository.deleteFolder(folderId));
  ipcBridge.projectHierarchy.reorderFolders.provider(async ({ groupId, folderIds }) =>
    repository.reorderFolders(groupId, folderIds)
  );
  ipcBridge.projectHierarchy.moveConversation.provider(async (params) => repository.moveConversationToFolder(params));
}
