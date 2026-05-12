/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const PERSONAL_WORKSPACE_ID = 'workspace-personal';
export const GENERAL_PROJECT_ID = 'project-general';

export type OrgRecordBase = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

export type WorkspaceRecord = OrgRecordBase & {
  assistant_id?: string;
  is_default?: boolean;
};

export type ProjectRecord = OrgRecordBase & {
  workspace_id: string;
  parent_project_id?: string;
  assistant_id?: string;
  icon?: string;
  is_default?: boolean;
};

export type OrgExpansionState = {
  workspaces: Record<string, boolean>;
  projects: Record<string, boolean>;
};

export type ConversationOrgExtra = {
  workspace_id?: string;
  project_id?: string;
  is_bookmarked?: boolean;
  bookmarked_at?: number;
  archived?: boolean;
  archived_at?: number;
};

export type ProjectTreeNode = ProjectRecord & {
  children: ProjectTreeNode[];
};

export const getDefaultWorkspace = (now = Date.now()): WorkspaceRecord => ({
  id: PERSONAL_WORKSPACE_ID,
  name: 'Personal',
  is_default: true,
  created_at: now,
  updated_at: now,
});

export const getDefaultProject = (workspaceId = PERSONAL_WORKSPACE_ID, now = Date.now()): ProjectRecord => ({
  id: GENERAL_PROJECT_ID,
  workspace_id: workspaceId,
  name: 'General',
  icon: 'folder',
  is_default: true,
  created_at: now,
  updated_at: now,
});

export const resolveWorkspaceId = (workspaceId?: string): string => workspaceId || PERSONAL_WORKSPACE_ID;
export const resolveProjectId = (projectId?: string): string => projectId || GENERAL_PROJECT_ID;
