/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProjectFolder, ProjectFolderGroup, ProjectHierarchy } from '@/common/types/projectHierarchy';

export type CreateProjectGroupParams = {
  name: string;
};

export type UpdateProjectGroupParams = {
  name?: string;
  sortOrder?: number;
};

export type CreateProjectFolderParams = {
  name: string;
  path: string;
  workspace?: string;
  groupId?: string;
  color?: string;
};

export type UpdateProjectFolderParams = {
  name?: string;
  color?: string;
  gitBranch?: string;
  defaultAgentType?: ProjectFolder['defaultAgentType'];
  groupId?: string;
  sortOrderInGroup?: number;
  isOpen?: boolean;
};

export type MoveConversationToProjectFolderParams = {
  conversationId: string;
  folderId: string | null;
};

export type IProjectHierarchyRepository = {
  listHierarchy(): Promise<ProjectHierarchy>;
  createGroup(params: CreateProjectGroupParams): Promise<ProjectFolderGroup>;
  updateGroup(groupId: string, updates: UpdateProjectGroupParams): Promise<ProjectFolderGroup | undefined>;
  deleteGroup(groupId: string): Promise<void>;
  reorderGroups(groupIds: string[]): Promise<void>;
  createFolder(params: CreateProjectFolderParams): Promise<ProjectFolder>;
  updateFolder(folderId: string, updates: UpdateProjectFolderParams): Promise<ProjectFolder | undefined>;
  deleteFolder(folderId: string): Promise<void>;
  reorderFolders(groupId: string, folderIds: string[]): Promise<void>;
  moveConversationToFolder(params: MoveConversationToProjectFolderParams): Promise<void>;
};
