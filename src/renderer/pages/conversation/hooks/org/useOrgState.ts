/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProjectRecord, ProjectTreeNode, WorkspaceRecord } from '@/common/types/orgTypes';
import { PERSONAL_WORKSPACE_ID } from '@/common/types/orgTypes';
import {
  buildProjectTree,
  migrateOrgStorage,
  readActiveWorkspace,
  readProjects,
  readWorkspaces,
  writeActiveWorkspace,
  writeProjects,
  writeWorkspaces,
} from '@/common/utils/orgStorage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ORG_STORAGE_DEBOUNCE_MS = 150;

const useDebouncedWrite = <T>(value: T, write: (value: T) => void): void => {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    const timeout = window.setTimeout(() => write(value), ORG_STORAGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [value, write]);
};

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>(() => migrateOrgStorage().workspaces);

  useDebouncedWrite(workspaces, writeWorkspaces);

  const createWorkspace = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const now = Date.now();
    const workspace: WorkspaceRecord = {
      id: `workspace-${crypto.randomUUID()}`,
      name: trimmedName,
      created_at: now,
      updated_at: now,
    };
    setWorkspaces((prev) => [...prev, workspace]);
    return workspace;
  }, []);

  const renameWorkspace = useCallback((workspaceId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, name: trimmedName, updated_at: Date.now() } : workspace
      )
    );
  }, []);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    if (workspaceId === PERSONAL_WORKSPACE_ID) return;
    setWorkspaces((prev) => prev.filter((workspace) => workspace.id !== workspaceId));
  }, []);

  const refreshWorkspaces = useCallback(() => setWorkspaces(readWorkspaces()), []);

  return { workspaces, createWorkspace, renameWorkspace, deleteWorkspace, refreshWorkspaces };
};

export const useProjects = () => {
  const [projects, setProjects] = useState<ProjectRecord[]>(() => migrateOrgStorage().projects);

  useDebouncedWrite(projects, writeProjects);

  const createProject = useCallback((workspaceId: string, name: string, assistantId?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const now = Date.now();
    const project: ProjectRecord = {
      id: `project-${crypto.randomUUID()}`,
      workspace_id: workspaceId,
      name: trimmedName,
      assistant_id: assistantId,
      created_at: now,
      updated_at: now,
    };
    setProjects((prev) => [...prev, project]);
    return project;
  }, []);

  const renameProject = useCallback((projectId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, name: trimmedName, updated_at: Date.now() } : project
      )
    );
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    setProjects((prev) =>
      prev.filter((project) => project.id !== projectId && project.parent_project_id !== projectId)
    );
  }, []);

  const refreshProjects = useCallback(() => setProjects(readProjects()), []);

  return { projects, createProject, renameProject, deleteProject, refreshProjects };
};

export const useActiveWorkspace = (fallbackWorkspaceId = PERSONAL_WORKSPACE_ID) => {
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(
    () => readActiveWorkspace() || fallbackWorkspaceId
  );

  useEffect(() => {
    writeActiveWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    setActiveWorkspaceIdState(workspaceId);
  }, []);

  return { activeWorkspaceId, setActiveWorkspaceId };
};

export const useProjectTree = (projects: ProjectRecord[], workspaceId: string): ProjectTreeNode[] =>
  useMemo(() => buildProjectTree(projects, workspaceId), [projects, workspaceId]);
