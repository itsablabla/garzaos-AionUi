/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ProjectFolderGroup } from '@/common/types/projectHierarchy';
import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';
import { Badge, Tooltip } from '@arco-design/web-react';
import { FolderOpen, Right, Down } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ProjectHierarchyTreeProps = {
  groups: ProjectFolderGroup[];
  conversations: TChatConversation[];
  expandedWorkspaces: string[];
  collapsed: boolean;
  onToggleWorkspace: (workspace: string) => void;
  renderConversation: (conversation: TChatConversation) => React.ReactNode;
};

const getConversationProjectFolderId = (conversation: TChatConversation): string | undefined => {
  const extra = conversation.extra as { projectFolderId?: string } | undefined;
  return typeof extra?.projectFolderId === 'string' && extra.projectFolderId ? extra.projectFolderId : undefined;
};

const buildConversationLookup = (conversations: TChatConversation[]): Map<string, TChatConversation[]> => {
  const lookup = new Map<string, TChatConversation[]>();
  conversations.forEach((conversation) => {
    const workspace = conversation.extra?.workspace;
    const customWorkspace = conversation.extra?.customWorkspace;
    if (!workspace || !customWorkspace) return;
    const folderId = getConversationProjectFolderId(conversation) ?? `workspace:${encodeURIComponent(workspace)}`;
    const list = lookup.get(folderId) ?? [];
    list.push(conversation);
    lookup.set(folderId, list);
  });
  lookup.forEach((list) =>
    list.sort((a, b) => (b.modifyTime || b.createTime || 0) - (a.modifyTime || a.createTime || 0))
  );
  return lookup;
};

const ProjectHierarchyTree: React.FC<ProjectHierarchyTreeProps> = ({
  groups,
  conversations,
  expandedWorkspaces,
  collapsed,
  onToggleWorkspace,
  renderConversation,
}) => {
  const { t } = useTranslation();
  const conversationLookup = React.useMemo(() => buildConversationLookup(conversations), [conversations]);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set());

  const toggleGroup = React.useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  if (groups.length === 0) return null;

  return (
    <div className='mb-8px min-w-0'>
      {!collapsed && (
        <div className='px-12px py-8px sticky top-0 z-10 bg-fill-2'>
          <span className='text-13px text-t-secondary font-bold leading-20px'>
            {t('conversation.history.projectsSection')}
          </span>
        </div>
      )}
      {groups.map((group) => {
        const groupCollapsed = collapsedGroups.has(group.id);
        return (
          <div key={group.id} className='min-w-0'>
            {!collapsed && (
              <div
                className='flex items-center gap-6px px-12px py-6px cursor-pointer select-none hover:bg-fill-2 transition-colors'
                onClick={() => toggleGroup(group.id)}
              >
                <span className='text-t-secondary flex-center'>
                  {groupCollapsed ? <Right theme='outline' size={12} /> : <Down theme='outline' size={12} />}
                </span>
                <span className='text-13px text-t-primary font-medium truncate flex-1 min-w-0'>
                  {group.id === 'default-workspaces' ? t('conversation.history.defaultProjectGroup') : group.name}
                </span>
              </div>
            )}
            {!groupCollapsed &&
              group.folders.map((folder) => {
                const folderConversations = conversationLookup.get(folder.id) ?? [];
                if (folderConversations.length === 0) return null;
                return (
                  <WorkspaceCollapse
                    key={folder.id}
                    expanded={expandedWorkspaces.includes(folder.workspace)}
                    onToggle={() => onToggleWorkspace(folder.workspace)}
                    siderCollapsed={collapsed}
                    header={
                      <div className='flex items-center gap-8px text-14px min-w-0'>
                        <FolderOpen theme='outline' size='16' fill='var(--color-text-2)' />
                        <Tooltip content={folder.path} disabled={collapsed} position='top'>
                          <span
                            className={classNames('font-medium truncate flex-1 min-w-0', {
                              'text-t-primary': folder.isOpen,
                              'text-t-secondary': !folder.isOpen,
                            })}
                          >
                            {folder.name}
                          </span>
                        </Tooltip>
                        {!collapsed && (
                          <Badge count={folderConversations.length} dot={folderConversations.length < 10} />
                        )}
                      </div>
                    }
                  >
                    <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-2px': !collapsed })}>
                      {folderConversations.map((conversation) => renderConversation(conversation))}
                    </div>
                  </WorkspaceCollapse>
                );
              })}
          </div>
        );
      })}
    </div>
  );
};

export default ProjectHierarchyTree;
