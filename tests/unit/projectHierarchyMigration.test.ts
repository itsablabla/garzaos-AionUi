/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { initSchema, CURRENT_DB_VERSION } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

let nativeModuleAvailable = true;
try {
  const driver = new BetterSqlite3Driver(':memory:');
  driver.close();
} catch (error) {
  if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('migration v27: project folder hierarchy', () => {
  it('creates hierarchy tables and indexes in the current schema', () => {
    const driver = new BetterSqlite3Driver(':memory:');
    try {
      initSchema(driver);
      const groupColumns = (driver.pragma('table_info(folder_groups)') as Array<{ name: string }>).map((c) => c.name);
      const folderColumns = (driver.pragma('table_info(project_folders)') as Array<{ name: string }>).map(
        (c) => c.name
      );

      expect(CURRENT_DB_VERSION).toBe(27);
      expect(groupColumns).toEqual(expect.arrayContaining(['id', 'name', 'sort_order', 'deleted_at']));
      expect(folderColumns).toEqual(
        expect.arrayContaining([
          'id',
          'name',
          'workspace',
          'git_branch',
          'default_agent_type',
          'group_id',
          'sort_order_in_group',
          'is_open',
          'deleted_at',
        ])
      );

      const indexes = driver.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{
        name: string;
      }>;
      expect(indexes.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'idx_folder_groups_deleted_sort',
          'idx_project_folders_group_sort',
          'idx_conversations_project_folder',
        ])
      );
    } finally {
      driver.close();
    }
  });

  it('backfills flat custom workspaces into folders without losing conversation workspace data', () => {
    const driver = new BetterSqlite3Driver(':memory:');
    try {
      initSchema(driver);
      runMigrations(driver, 0, 26);
      driver
        .prepare(
          `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('system_default_user', 'system', '', 1, 1)`
        )
        .run();
      driver
        .prepare(
          `INSERT INTO conversations (id, user_id, name, type, extra, created_at, updated_at)
         VALUES (?, 'system_default_user', ?, 'acp', ?, ?, ?)`
        )
        .run('conv-1', 'Workspace chat', JSON.stringify({ workspace: '/repo/a', customWorkspace: true }), 1000, 2000);
      driver
        .prepare(
          `INSERT INTO conversations (id, user_id, name, type, extra, created_at, updated_at)
         VALUES (?, 'system_default_user', ?, 'acp', ?, ?, ?)`
        )
        .run('conv-2', 'Loose chat', JSON.stringify({}), 1000, 1500);

      runMigrations(driver, 26, 27);

      const groups = driver.prepare('SELECT * FROM folder_groups WHERE deleted_at IS NULL').all() as Array<{
        id: string;
      }>;
      const folders = driver.prepare('SELECT * FROM project_folders WHERE deleted_at IS NULL').all() as Array<{
        id: string;
        workspace: string;
        group_id: string;
      }>;
      const conversation = driver.prepare('SELECT extra FROM conversations WHERE id = ?').get('conv-1') as {
        extra: string;
      };
      const extra = JSON.parse(conversation.extra) as {
        workspace: string;
        customWorkspace: boolean;
        projectFolderId: string;
      };

      expect(groups).toHaveLength(1);
      expect(folders).toEqual([expect.objectContaining({ workspace: '/repo/a', group_id: 'default-workspaces' })]);
      expect(extra.workspace).toBe('/repo/a');
      expect(extra.customWorkspace).toBe(true);
      expect(extra.projectFolderId).toBe(folders[0].id);
    } finally {
      driver.close();
    }
  });
});
