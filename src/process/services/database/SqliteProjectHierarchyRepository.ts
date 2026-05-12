/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProjectFolder, ProjectFolderGroup, ProjectHierarchy } from '@/common/types/projectHierarchy';
import { getDatabase } from '@process/services/database';
import type {
  CreateProjectFolderParams,
  CreateProjectGroupParams,
  IProjectHierarchyRepository,
  MoveConversationToProjectFolderParams,
  UpdateProjectFolderParams,
  UpdateProjectGroupParams,
} from './IProjectHierarchyRepository';

const DEFAULT_GROUP_ID = 'default-workspaces';
const DEFAULT_GROUP_NAME = 'Workspaces';

const makeId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const workspaceName = (workspace: string): string => {
  const normalized = workspace.replace(/[/\\]+$/, '');
  return normalized.split(/[/\\]/).filter(Boolean).at(-1) || workspace;
};

type FolderGroupRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

type ProjectFolderRow = {
  id: string;
  name: string;
  path: string;
  workspace: string;
  color?: string | null;
  git_branch?: string | null;
  default_agent_type?: ProjectFolder['defaultAgentType'] | null;
  group_id: string;
  sort_order_in_group: number;
  is_open: number;
  created_at: number;
  updated_at: number;
};

type WorkspaceBackfillRow = {
  workspace: string;
  updated_at: number;
};

const toFolder = (row: ProjectFolderRow): ProjectFolder => ({
  id: row.id,
  name: row.name,
  path: row.path,
  workspace: row.workspace,
  color: row.color ?? undefined,
  gitBranch: row.git_branch ?? undefined,
  defaultAgentType: row.default_agent_type ?? undefined,
  groupId: row.group_id,
  sortOrderInGroup: row.sort_order_in_group,
  isOpen: row.is_open === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toGroup = (row: FolderGroupRow, folders: ProjectFolder[]): ProjectFolderGroup => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  folders,
});

export class SqliteProjectHierarchyRepository implements IProjectHierarchyRepository {
  private async getDriver() {
    const database = await getDatabase();
    return database.getDriver();
  }

  private async ensureBackfilled(): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    db.prepare(
      `INSERT OR IGNORE INTO folder_groups (id, name, sort_order, deleted_at, created_at, updated_at)
       VALUES (?, ?, 0, NULL, ?, ?)`
    ).run(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, now, now);

    const rows = db
      .prepare(
        `SELECT json_extract(extra, '$.workspace') AS workspace, MAX(updated_at) AS updated_at
         FROM conversations
         WHERE json_extract(extra, '$.customWorkspace') = 1
           AND json_extract(extra, '$.workspace') IS NOT NULL
           AND json_extract(extra, '$.workspace') != ''
         GROUP BY workspace
         ORDER BY updated_at DESC`
      )
      .all() as WorkspaceBackfillRow[];

    const insertFolder = db.prepare(
      `INSERT OR IGNORE INTO project_folders (
        id, name, path, workspace, color, git_branch, default_agent_type, group_id,
        sort_order_in_group, is_open, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, NULL, ?, ?)`
    );
    const updateConversationFolder = db.prepare(
      `UPDATE conversations
       SET extra = json_set(extra, '$.projectFolderId', ?)
       WHERE json_extract(extra, '$.customWorkspace') = 1
         AND json_extract(extra, '$.workspace') = ?
         AND json_extract(extra, '$.projectFolderId') IS NULL`
    );

    const run = db.transaction(() => {
      rows.forEach((row, index) => {
        const folderId = `workspace:${encodeURIComponent(row.workspace)}`;
        insertFolder.run(
          folderId,
          workspaceName(row.workspace),
          row.workspace,
          row.workspace,
          DEFAULT_GROUP_ID,
          index,
          now,
          row.updated_at || now
        );
        updateConversationFolder.run(folderId, row.workspace);
      });
    });
    run();
  }

  async listHierarchy(): Promise<ProjectHierarchy> {
    await this.ensureBackfilled();
    const db = await this.getDriver();
    const groupRows = db
      .prepare(
        `SELECT id, name, sort_order, created_at, updated_at
         FROM folder_groups
         WHERE deleted_at IS NULL
         ORDER BY sort_order ASC, id ASC`
      )
      .all() as FolderGroupRow[];
    const folderRows = db
      .prepare(
        `SELECT id, name, path, workspace, color, git_branch, default_agent_type, group_id,
                sort_order_in_group, is_open, created_at, updated_at
         FROM project_folders
         WHERE deleted_at IS NULL
         ORDER BY group_id ASC, sort_order_in_group ASC, id ASC`
      )
      .all() as ProjectFolderRow[];

    const foldersByGroup = new Map<string, ProjectFolder[]>();
    folderRows.forEach((row) => {
      const folders = foldersByGroup.get(row.group_id) ?? [];
      folders.push(toFolder(row));
      foldersByGroup.set(row.group_id, folders);
    });

    return {
      groups: groupRows.map((row) => toGroup(row, foldersByGroup.get(row.id) ?? [])),
    };
  }

  async createGroup(params: CreateProjectGroupParams): Promise<ProjectFolderGroup> {
    const db = await this.getDriver();
    const now = Date.now();
    const id = makeId('group');
    const row = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM folder_groups WHERE deleted_at IS NULL')
      .get() as {
      nextOrder: number;
    };
    db.prepare(
      `INSERT INTO folder_groups (id, name, sort_order, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`
    ).run(id, params.name, row.nextOrder, now, now);
    return { id, name: params.name, sortOrder: row.nextOrder, createdAt: now, updatedAt: now, folders: [] };
  }

  async updateGroup(groupId: string, updates: UpdateProjectGroupParams): Promise<ProjectFolderGroup | undefined> {
    const db = await this.getDriver();
    const existing = db.prepare('SELECT * FROM folder_groups WHERE id = ? AND deleted_at IS NULL').get(groupId) as
      | FolderGroupRow
      | undefined;
    if (!existing) return undefined;
    const updated = {
      name: updates.name ?? existing.name,
      sortOrder: updates.sortOrder ?? existing.sort_order,
      updatedAt: Date.now(),
    };
    db.prepare('UPDATE folder_groups SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
      updated.name,
      updated.sortOrder,
      updated.updatedAt,
      groupId
    );
    return {
      id: groupId,
      name: updated.name,
      sortOrder: updated.sortOrder,
      createdAt: existing.created_at,
      updatedAt: updated.updatedAt,
      folders: [],
    };
  }

  async deleteGroup(groupId: string): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    const run = db.transaction(() => {
      db.prepare(
        'UPDATE project_folders SET deleted_at = ?, is_open = 0, updated_at = ? WHERE group_id = ? AND deleted_at IS NULL'
      ).run(now, now, groupId);
      db.prepare('UPDATE folder_groups SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
        now,
        now,
        groupId
      );
    });
    run();
  }

  async reorderGroups(groupIds: string[]): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    const stmt = db.prepare(
      'UPDATE folder_groups SET sort_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    );
    const run = db.transaction(() => groupIds.forEach((groupId, index) => stmt.run(index, now, groupId)));
    run();
  }

  async createFolder(params: CreateProjectFolderParams): Promise<ProjectFolder> {
    const db = await this.getDriver();
    const now = Date.now();
    const id = makeId('folder');
    const workspace = params.workspace ?? params.path;
    const groupId = params.groupId ?? DEFAULT_GROUP_ID;
    const row = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order_in_group), -1) + 1 AS nextOrder FROM project_folders WHERE group_id = ? AND deleted_at IS NULL'
      )
      .get(groupId) as {
      nextOrder: number;
    };
    db.prepare(
      `INSERT INTO project_folders (
        id, name, path, workspace, color, git_branch, default_agent_type, group_id,
        sort_order_in_group, is_open, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 1, NULL, ?, ?)`
    ).run(id, params.name, params.path, workspace, params.color ?? null, groupId, row.nextOrder, now, now);
    return {
      id,
      name: params.name,
      path: params.path,
      workspace,
      color: params.color,
      groupId,
      sortOrderInGroup: row.nextOrder,
      isOpen: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateFolder(folderId: string, updates: UpdateProjectFolderParams): Promise<ProjectFolder | undefined> {
    const db = await this.getDriver();
    const existing = db.prepare('SELECT * FROM project_folders WHERE id = ? AND deleted_at IS NULL').get(folderId) as
      | ProjectFolderRow
      | undefined;
    if (!existing) return undefined;
    const next = {
      name: updates.name ?? existing.name,
      color: updates.color ?? existing.color ?? null,
      gitBranch: updates.gitBranch ?? existing.git_branch ?? null,
      defaultAgentType: updates.defaultAgentType ?? existing.default_agent_type ?? null,
      groupId: updates.groupId ?? existing.group_id,
      sortOrderInGroup: updates.sortOrderInGroup ?? existing.sort_order_in_group,
      isOpen: updates.isOpen ?? existing.is_open === 1,
      updatedAt: Date.now(),
    };
    db.prepare(
      `UPDATE project_folders
       SET name = ?, color = ?, git_branch = ?, default_agent_type = ?, group_id = ?,
           sort_order_in_group = ?, is_open = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      next.name,
      next.color,
      next.gitBranch,
      next.defaultAgentType,
      next.groupId,
      next.sortOrderInGroup,
      next.isOpen ? 1 : 0,
      next.updatedAt,
      folderId
    );
    return toFolder({
      ...existing,
      name: next.name,
      color: next.color,
      git_branch: next.gitBranch,
      default_agent_type: next.defaultAgentType,
      group_id: next.groupId,
      sort_order_in_group: next.sortOrderInGroup,
      is_open: next.isOpen ? 1 : 0,
      updated_at: next.updatedAt,
    });
  }

  async deleteFolder(folderId: string): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    db.prepare(
      'UPDATE project_folders SET deleted_at = ?, is_open = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    ).run(now, now, folderId);
  }

  async reorderFolders(groupId: string, folderIds: string[]): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    const stmt = db.prepare(
      'UPDATE project_folders SET group_id = ?, sort_order_in_group = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    );
    const run = db.transaction(() => folderIds.forEach((folderId, index) => stmt.run(groupId, index, now, folderId)));
    run();
  }

  async moveConversationToFolder(params: MoveConversationToProjectFolderParams): Promise<void> {
    const db = await this.getDriver();
    const now = Date.now();
    if (!params.folderId) {
      db.prepare(
        `UPDATE conversations
         SET extra = json_remove(extra, '$.projectFolderId'), updated_at = ?
         WHERE id = ?`
      ).run(now, params.conversationId);
      return;
    }

    const folder = db
      .prepare('SELECT id, workspace FROM project_folders WHERE id = ? AND deleted_at IS NULL')
      .get(params.folderId) as { id: string; workspace: string } | undefined;
    if (!folder) return;
    db.prepare(
      `UPDATE conversations
       SET extra = json_set(json_set(json_set(extra, '$.projectFolderId', ?), '$.workspace', ?), '$.customWorkspace', json('true')),
           updated_at = ?
       WHERE id = ?`
    ).run(folder.id, folder.workspace, now, params.conversationId);
  }
}
