/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProjectFolderAgentType =
  | 'gemini'
  | 'acp'
  | 'openclaw-gateway'
  | 'nanobot'
  | 'remote'
  | 'replica'
  | 'aionrs';

export type ProjectFolderGroup = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  folders: ProjectFolder[];
};

export type ProjectFolder = {
  id: string;
  name: string;
  path: string;
  workspace: string;
  color?: string;
  gitBranch?: string;
  defaultAgentType?: ProjectFolderAgentType;
  groupId: string;
  sortOrderInGroup: number;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ProjectHierarchy = {
  groups: ProjectFolderGroup[];
};
