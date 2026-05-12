/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';

export const SESSION_CATEGORIES = ['code', 'plan', 'research', 'debugging', 'disposable', 'reference'] as const;

export type SessionCategory = (typeof SESSION_CATEGORIES)[number];
export type SessionStatusFilter = 'all' | 'favorite' | 'pinned' | 'team';

export type SessionFilters = {
  query: string;
  backend: string;
  status: SessionStatusFilter;
  category: SessionCategory | 'all';
  date: string;
};

type SessionExtra = {
  isHealthCheck?: boolean;
  pinned?: boolean;
  favorited?: boolean;
  backend?: string;
  teamId?: string;
  sessionKind?: SessionCategory;
  category?: SessionCategory;
  workspace?: string;
  customWorkspace?: boolean;
};

export type SessionArchiveFolder = {
  key: string;
  count: number;
  conversations: TChatConversation[];
  subtitle: string;
  lastModify: number;
};

export const isSessionPinned = (conversation: TChatConversation): boolean => {
  return Boolean((conversation.extra as SessionExtra | undefined)?.pinned);
};

export const isSessionFavorited = (conversation: TChatConversation): boolean => {
  return Boolean((conversation.extra as SessionExtra | undefined)?.favorited);
};

export const isVisibleSession = (conversation: TChatConversation): boolean => {
  return (conversation.extra as SessionExtra | undefined)?.isHealthCheck !== true;
};

export const getSessionBackendKey = (conversation: TChatConversation): string => {
  const extra = conversation.extra as SessionExtra | undefined;
  return extra?.backend ?? conversation.type;
};

export const getSessionCategory = (conversation: TChatConversation): SessionCategory | undefined => {
  const extra = conversation.extra as SessionExtra | undefined;
  const category = extra?.sessionKind ?? extra?.category;
  return SESSION_CATEGORIES.includes(category as SessionCategory) ? (category as SessionCategory) : undefined;
};

export const hasTeamSession = (conversation: TChatConversation): boolean => {
  return Boolean((conversation.extra as SessionExtra | undefined)?.teamId);
};

export const getSessionGroupLabel = (conversation: TChatConversation): string | undefined => {
  const extra = conversation.extra as SessionExtra | undefined;
  if (!extra?.customWorkspace || !extra.workspace) return undefined;
  return getWorkspaceDisplayName(extra.workspace);
};

export const sortSessionsForCenter = (conversations: TChatConversation[]): TChatConversation[] => {
  return [...conversations].toSorted((a, b) => {
    const pinnedDelta = Number(isSessionPinned(b)) - Number(isSessionPinned(a));
    if (pinnedDelta !== 0) return pinnedDelta;

    const favoriteDelta = Number(isSessionFavorited(b)) - Number(isSessionFavorited(a));
    if (favoriteDelta !== 0) return favoriteDelta;

    return b.modifyTime - a.modifyTime;
  });
};

export const filterSessionsByTitle = (conversations: TChatConversation[], query: string): TChatConversation[] => {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return conversations;
  return conversations.filter((conversation) => conversation.name.toLocaleLowerCase().includes(keyword));
};

export const filterSessionsForCenter = (
  conversations: TChatConversation[],
  filters: SessionFilters
): TChatConversation[] => {
  const titleFiltered = filterSessionsByTitle(conversations, filters.query);
  return titleFiltered.filter((conversation) => {
    if (filters.backend !== 'all' && getSessionBackendKey(conversation) !== filters.backend) return false;
    if (filters.category !== 'all' && getSessionCategory(conversation) !== filters.category) return false;
    if (filters.date && formatSessionDateKey(conversation.createTime) !== filters.date) return false;
    if (filters.status === 'favorite' && !isSessionFavorited(conversation)) return false;
    if (filters.status === 'pinned' && !isSessionPinned(conversation)) return false;
    if (filters.status === 'team' && !hasTeamSession(conversation)) return false;
    return true;
  });
};

export const getSessionBackendOptions = (conversations: TChatConversation[]): string[] => {
  return [...new Set(conversations.map(getSessionBackendKey))].toSorted((a, b) => a.localeCompare(b));
};

export const formatSessionDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const splitSessionsIntoRecentAndArchive = (
  conversations: TChatConversation[],
  recentLimit = 10
): { recent: TChatConversation[]; folders: SessionArchiveFolder[] } => {
  const recent = conversations.slice(0, recentLimit);
  const archived = conversations.slice(recentLimit);
  const foldersByDate = new Map<string, TChatConversation[]>();

  archived.forEach((conversation) => {
    const key = formatSessionDateKey(conversation.createTime);
    foldersByDate.set(key, [...(foldersByDate.get(key) ?? []), conversation]);
  });

  const folders = [...foldersByDate.entries()]
    .toSorted(([dateA], [dateB]) => dateB.localeCompare(dateA))
    .map(([key, items]) => {
      const conversationsForDate = items.toSorted((a, b) => b.createTime - a.createTime);
      const latest = conversationsForDate[0];
      return {
        key,
        count: conversationsForDate.length,
        conversations: conversationsForDate,
        subtitle: latest?.name ?? '',
        lastModify: latest?.modifyTime ?? 0,
      };
    });

  return { recent, folders };
};
