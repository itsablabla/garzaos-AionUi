import { describe, expect, it, beforeEach, vi } from 'vitest';

import { GENERAL_PROJECT_ID, PERSONAL_WORKSPACE_ID } from '@/common/types/orgTypes';
import {
  buildProjectTree,
  createStarterProjectsFromAssistants,
  getProjectBreadcrumb,
  migrateOrgStorage,
  readActiveWorkspace,
} from '@/common/utils/orgStorage';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

describe('orgStorage', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('creates default Personal workspace and General project on first launch', () => {
    const { workspaces, projects } = migrateOrgStorage(1000);

    expect(workspaces[0]).toMatchObject({ id: PERSONAL_WORKSPACE_ID, name: 'Personal', is_default: true });
    expect(projects[0]).toMatchObject({ id: GENERAL_PROJECT_ID, workspace_id: PERSONAL_WORKSPACE_ID, name: 'General' });
    expect(readActiveWorkspace()).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('creates starter projects linked to assistant ids without duplicating existing assistants', () => {
    const existingProjects = [
      {
        id: GENERAL_PROJECT_ID,
        workspace_id: PERSONAL_WORKSPACE_ID,
        name: 'General',
        assistant_id: 'word-creator',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const starterProjects = createStarterProjectsFromAssistants(existingProjects, PERSONAL_WORKSPACE_ID, 1000);

    expect(starterProjects.some((project) => project.assistant_id === 'word-creator')).toBe(false);
    expect(starterProjects.some((project) => project.assistant_id === 'ppt-creator')).toBe(true);
  });

  it('builds flat-compatible project trees and breadcrumbs', () => {
    const projects = [
      { id: GENERAL_PROJECT_ID, workspace_id: PERSONAL_WORKSPACE_ID, name: 'General', created_at: 1, updated_at: 1 },
      {
        id: 'child',
        workspace_id: PERSONAL_WORKSPACE_ID,
        parent_project_id: GENERAL_PROJECT_ID,
        name: 'Active',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const tree = buildProjectTree(projects, PERSONAL_WORKSPACE_ID);

    expect(tree[0].children[0].name).toBe('Active');
    expect(getProjectBreadcrumb(projects, PERSONAL_WORKSPACE_ID, 'child')).toEqual(['General', 'Active']);
    expect(getProjectBreadcrumb(projects, undefined, undefined)).toEqual(['General']);
  });
});
