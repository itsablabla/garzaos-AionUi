/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ProjectFolder, ProjectFolderGroup } from '@/common/types/projectHierarchy';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspace/workspaceHistory';

import type { GroupedHistoryResult, TimelineItem, TimelineSection } from '../types';
import { getConversationSortOrder } from './sortOrderHelpers';

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

export const isCronJobConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { cronJobId?: string } | undefined;
  return Boolean(extra?.cronJobId);
};

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinnedAt?: number } | undefined;
  if (typeof extra?.pinnedAt === 'number') {
    return extra.pinnedAt;
  }
  return 0;
};

export const groupConversationsByWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const customWorkspace = conv.extra?.customWorkspace;

    if (customWorkspace && workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  const items: TimelineItem[] = [];

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].toSorted((a, b) => getActivityTime(b) - getActivityTime(a));
    const latestConversationTime = getActivityTime(sortedConvs[0]);
    const updateTime = getWorkspaceUpdateTime(workspace);
    const time = Math.max(updateTime, latestConversationTime);
    items.push({
      type: 'workspace',
      time,
      workspaceGroup: {
        workspace,
        displayName: getWorkspaceDisplayName(workspace),
        conversations: sortedConvs,
      },
    });
  });

  withoutWorkspaceConvs.forEach((conv) => {
    items.push({
      type: 'conversation',
      time: getActivityTime(conv),
      conversation: conv,
    });
  });

  items.sort((a, b) => b.time - a.time);

  if (items.length === 0) return [];

  return [
    {
      timeline: t('conversation.history.recents'),
      items,
    },
  ];
};

const getConversationProjectFolderId = (conversation: TChatConversation): string | undefined => {
  const extra = conversation.extra as { projectFolderId?: string } | undefined;
  return typeof extra?.projectFolderId === 'string' && extra.projectFolderId ? extra.projectFolderId : undefined;
};

export const buildProjectGroups = (conversations: TChatConversation[]): ProjectFolderGroup[] => {
  const folderMap = new Map<string, ProjectFolder & { conversations: TChatConversation[] }>();
  const groupMap = new Map<string, ProjectFolderGroup>();
  const sortedConversations = [...conversations].toSorted((a, b) => getActivityTime(b) - getActivityTime(a));

  sortedConversations.forEach((conversation) => {
    const workspace = conversation.extra?.workspace;
    const customWorkspace = conversation.extra?.customWorkspace;
    if (!workspace || !customWorkspace) return;

    const projectFolderId =
      getConversationProjectFolderId(conversation) ?? `workspace:${encodeURIComponent(workspace)}`;
    const existingFolder = folderMap.get(projectFolderId);
    if (existingFolder) {
      existingFolder.conversations.push(conversation);
      return;
    }

    const sortOrder = folderMap.size;
    const folder: ProjectFolder & { conversations: TChatConversation[] } = {
      id: projectFolderId,
      name: getWorkspaceDisplayName(workspace),
      path: workspace,
      workspace,
      groupId: 'default-workspaces',
      sortOrderInGroup: sortOrder,
      isOpen: true,
      createdAt: conversation.createTime,
      updatedAt: getActivityTime(conversation),
      conversations: [conversation],
    };
    folderMap.set(projectFolderId, folder);
  });

  const folders = [...folderMap.values()].toSorted((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    if (a.sortOrderInGroup !== b.sortOrderInGroup) return a.sortOrderInGroup - b.sortOrderInGroup;
    return b.updatedAt - a.updatedAt;
  });

  folders.forEach((folder) => {
    const existingGroup = groupMap.get(folder.groupId);
    if (existingGroup) {
      existingGroup.folders.push(folder);
      existingGroup.updatedAt = Math.max(existingGroup.updatedAt, folder.updatedAt);
      return;
    }

    groupMap.set(folder.groupId, {
      id: folder.groupId,
      name: folder.groupId,
      sortOrder: groupMap.size,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      folders: [folder],
    });
  });

  return [...groupMap.values()].toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
};

/** Check whether a conversation belongs to a team (should be hidden from sidebar). */
const isTeamConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { teamId?: string } | undefined;
  return Boolean(extra?.teamId);
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  // Filter out team-owned conversations; they are only visible via the Teams panel
  const visibleConversations = conversations.filter((conv) => !isTeamConversation(conv));

  const pinnedConversations = visibleConversations
    .filter((conversation) => isConversationPinned(conversation))
    .toSorted((a, b) => {
      const orderA = getConversationSortOrder(a);
      const orderB = getConversationSortOrder(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return getConversationPinnedAt(b) - getConversationPinnedAt(a);
    });

  const normalConversations = visibleConversations.filter(
    (conversation) => !isConversationPinned(conversation) && !isCronJobConversation(conversation)
  );

  return {
    pinnedConversations,
    projectGroups: buildProjectGroups(normalConversations),
    timelineSections: groupConversationsByWorkspace(normalConversations, t),
  };
};
