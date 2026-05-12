/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import type { OrgExpansionState, ProjectRecord, ProjectTreeNode, WorkspaceRecord } from '@/common/types/orgTypes';
import {
  GENERAL_PROJECT_ID,
  PERSONAL_WORKSPACE_ID,
  getDefaultProject,
  getDefaultWorkspace,
  resolveProjectId,
  resolveWorkspaceId,
} from '@/common/types/orgTypes';

const isBrowserStorageAvailable = (): boolean => typeof localStorage !== 'undefined';

const readJson = <T>(key: string, fallback: T): T => {
  if (!isBrowserStorageAvailable()) return fallback;
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T): void => {
  if (!isBrowserStorageAvailable()) return;
  localStorage.setItem(key, JSON.stringify(value));
};

const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ');
const slugify = (value: string): string =>
  normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const ensureUniqueProjectId = (baseId: string, projects: ProjectRecord[]): string => {
  const ids = new Set(projects.map((project) => project.id));
  if (!ids.has(baseId)) return baseId;
  let index = 2;
  let candidate = `${baseId}-${index}`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }
  return candidate;
};

export const createStarterProjectsFromAssistants = (
  existingProjects: ProjectRecord[],
  workspaceId = PERSONAL_WORKSPACE_ID,
  now = Date.now()
): ProjectRecord[] => {
  const existingAssistantIds = new Set(existingProjects.map((project) => project.assistant_id).filter(Boolean));
  const existingNames = new Set(existingProjects.map((project) => normalizeName(project.name).toLowerCase()));
  const starterProjects: ProjectRecord[] = [];

  for (const assistant of ASSISTANT_PRESETS) {
    if (existingAssistantIds.has(assistant.id)) continue;
    const name = assistant.nameI18n['en-US'] || assistant.id;
    if (existingNames.has(normalizeName(name).toLowerCase())) continue;
    const id = ensureUniqueProjectId(`project-${slugify(assistant.id)}`, [...existingProjects, ...starterProjects]);
    starterProjects.push({
      id,
      workspace_id: workspaceId,
      name,
      icon: assistant.avatar,
      assistant_id: assistant.id,
      created_at: now,
      updated_at: now,
    });
  }

  return starterProjects;
};

export const migrateOrgStorage = (now = Date.now()): { workspaces: WorkspaceRecord[]; projects: ProjectRecord[] } => {
  const defaultWorkspace = getDefaultWorkspace(now);
  const defaultProject = getDefaultProject(defaultWorkspace.id, now);
  const storedWorkspaces = readJson<WorkspaceRecord[]>(STORAGE_KEYS.ORG_WORKSPACES, []);
  const storedProjects = readJson<ProjectRecord[]>(STORAGE_KEYS.ORG_PROJECTS, []);

  const workspaces = storedWorkspaces.some((workspace) => workspace.id === PERSONAL_WORKSPACE_ID)
    ? storedWorkspaces
    : [defaultWorkspace, ...storedWorkspaces];

  const projectsWithDefault = storedProjects.some((project) => project.id === GENERAL_PROJECT_ID)
    ? storedProjects
    : [defaultProject, ...storedProjects];
  const projects =
    storedProjects.length === 0
      ? [...projectsWithDefault, ...createStarterProjectsFromAssistants(projectsWithDefault, defaultWorkspace.id, now)]
      : projectsWithDefault;

  writeJson(STORAGE_KEYS.ORG_WORKSPACES, workspaces);
  writeJson(STORAGE_KEYS.ORG_PROJECTS, projects);

  if (!readActiveWorkspace()) {
    writeActiveWorkspace(defaultWorkspace.id);
  }

  return { workspaces, projects };
};

export const readWorkspaces = (): WorkspaceRecord[] => migrateOrgStorage().workspaces;
export const writeWorkspaces = (workspaces: WorkspaceRecord[]): void =>
  writeJson(STORAGE_KEYS.ORG_WORKSPACES, workspaces);
export const readProjects = (): ProjectRecord[] => migrateOrgStorage().projects;
export const writeProjects = (projects: ProjectRecord[]): void => writeJson(STORAGE_KEYS.ORG_PROJECTS, projects);

export const readOrgExpansion = (): OrgExpansionState =>
  readJson<OrgExpansionState>(STORAGE_KEYS.ORG_EXPANSION, { workspaces: {}, projects: {} });
export const writeOrgExpansion = (expansion: OrgExpansionState): void =>
  writeJson(STORAGE_KEYS.ORG_EXPANSION, expansion);

export const readActiveWorkspace = (): string | null => {
  if (!isBrowserStorageAvailable()) return null;
  return localStorage.getItem(STORAGE_KEYS.ORG_ACTIVE_WORKSPACE);
};

export const writeActiveWorkspace = (workspaceId: string): void => {
  if (!isBrowserStorageAvailable()) return;
  localStorage.setItem(STORAGE_KEYS.ORG_ACTIVE_WORKSPACE, workspaceId);
};

export const buildProjectTree = (projects: ProjectRecord[], workspaceId: string): ProjectTreeNode[] => {
  const workspaceProjects = projects.filter((project) => project.workspace_id === workspaceId);
  const nodes = new Map<string, ProjectTreeNode>();
  workspaceProjects.forEach((project) => nodes.set(project.id, { ...project, children: [] }));

  const roots: ProjectTreeNode[] = [];
  nodes.forEach((node) => {
    const parentId = node.parent_project_id;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (items: ProjectTreeNode[]): ProjectTreeNode[] =>
    items
      .toSorted((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) || a.name.localeCompare(b.name))
      .map((item) => ({ ...item, children: sortNodes(item.children) }));

  return sortNodes(roots);
};

export const getProjectBreadcrumb = (projects: ProjectRecord[], workspaceId?: string, projectId?: string): string[] => {
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const resolvedProjectId = resolveProjectId(projectId);
  const byId = new Map(
    projects.filter((project) => project.workspace_id === resolvedWorkspaceId).map((project) => [project.id, project])
  );
  const breadcrumb: string[] = [];
  let current = byId.get(resolvedProjectId);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    breadcrumb.unshift(current.name);
    current = current.parent_project_id ? byId.get(current.parent_project_id) : undefined;
  }

  if (breadcrumb.length > 0) return breadcrumb;
  const generalProject = byId.get(GENERAL_PROJECT_ID);
  return [generalProject?.name || 'General'];
};
