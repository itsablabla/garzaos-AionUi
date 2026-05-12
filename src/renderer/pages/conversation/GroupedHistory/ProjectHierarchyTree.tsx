/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { ProjectFolder, ProjectFolderGroup } from '@/common/types/projectHierarchy';
import WorkspaceFolderSelect from '@/renderer/components/workspace/WorkspaceFolderSelect';
import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';
import { emitter } from '@/renderer/utils/emitter';
import { Badge, Button, Dropdown, Form, Input, Menu, Message, Modal, Tooltip } from '@arco-design/web-react';
import { DeleteOne, Down, EditOne, FolderOpen, FolderPlus, MoreOne, Plus, Right } from '@icon-park/react';
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

type ProjectDialogMode = 'create-project' | 'rename-project';
type FolderDialogMode = 'create-folder' | 'rename-folder';

type ProjectDialogState = {
  mode: ProjectDialogMode;
  group?: ProjectFolderGroup;
  name: string;
};

type FolderDialogState = {
  mode: FolderDialogMode;
  group: ProjectFolderGroup;
  folder?: ProjectFolder;
  name: string;
  workspace: string;
};

const DEFAULT_GROUP_ID = 'default-workspaces';

const getConversationProjectFolderId = (conversation: TChatConversation): string | undefined => {
  const extra = conversation.extra as { projectFolderId?: string } | undefined;
  return typeof extra?.projectFolderId === 'string' && extra.projectFolderId ? extra.projectFolderId : undefined;
};

export const buildConversationLookup = (conversations: TChatConversation[]): Map<string, TChatConversation[]> => {
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

const getProjectGroupName = (group: ProjectFolderGroup, t: (key: string) => string): string => {
  return group.id === DEFAULT_GROUP_ID ? t('conversation.history.defaultProjectGroup') : group.name;
};

const getWorkspaceName = (workspace: string): string => {
  const normalized = workspace.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part) return part;
  }
  return workspace;
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
  const [projectDialog, setProjectDialog] = React.useState<ProjectDialogState | null>(null);
  const [folderDialog, setFolderDialog] = React.useState<FolderDialogState | null>(null);
  const [dialogLoading, setDialogLoading] = React.useState(false);

  const refreshHierarchy = React.useCallback(() => {
    emitter.emit('chat.history.refresh');
  }, []);

  const toggleGroup = React.useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const openCreateProjectDialog = React.useCallback(() => {
    setProjectDialog({ mode: 'create-project', name: '' });
  }, []);

  const openRenameProjectDialog = React.useCallback((group: ProjectFolderGroup) => {
    setProjectDialog({ mode: 'rename-project', group, name: group.name });
  }, []);

  const openCreateFolderDialog = React.useCallback((group: ProjectFolderGroup) => {
    setFolderDialog({ mode: 'create-folder', group, name: '', workspace: '' });
  }, []);

  const openRenameFolderDialog = React.useCallback((group: ProjectFolderGroup, folder: ProjectFolder) => {
    setFolderDialog({ mode: 'rename-folder', group, folder, name: folder.name, workspace: folder.workspace });
  }, []);

  const handleProjectDialogOk = React.useCallback(async () => {
    if (!projectDialog?.name.trim()) return;

    setDialogLoading(true);
    try {
      if (projectDialog.mode === 'create-project') {
        await ipcBridge.projectHierarchy.createGroup.invoke({ name: projectDialog.name.trim() });
        Message.success(t('conversation.history.projectCreateSuccess'));
      } else if (projectDialog.group) {
        await ipcBridge.projectHierarchy.updateGroup.invoke({
          groupId: projectDialog.group.id,
          updates: { name: projectDialog.name.trim() },
        });
        Message.success(t('conversation.history.projectRenameSuccess'));
      }
      setProjectDialog(null);
      refreshHierarchy();
    } catch (error) {
      console.error('[ProjectHierarchyTree] Failed to save project group:', error);
      Message.error(
        projectDialog.mode === 'create-project'
          ? t('conversation.history.projectCreateFailed')
          : t('conversation.history.projectRenameFailed')
      );
    } finally {
      setDialogLoading(false);
    }
  }, [projectDialog, refreshHierarchy, t]);

  const handleFolderDialogOk = React.useCallback(async () => {
    if (!folderDialog?.name.trim() || !folderDialog.workspace.trim()) return;

    const workspace = folderDialog.workspace.trim();
    setDialogLoading(true);
    try {
      if (folderDialog.mode === 'create-folder') {
        await ipcBridge.projectHierarchy.createFolder.invoke({
          groupId: folderDialog.group.id,
          name: folderDialog.name.trim(),
          path: workspace,
          workspace,
        });
        Message.success(t('conversation.history.folderCreateSuccess'));
      } else if (folderDialog.folder) {
        await ipcBridge.projectHierarchy.updateFolder.invoke({
          folderId: folderDialog.folder.id,
          updates: { name: folderDialog.name.trim() },
        });
        Message.success(t('conversation.history.folderRenameSuccess'));
      }
      setFolderDialog(null);
      refreshHierarchy();
    } catch (error) {
      console.error('[ProjectHierarchyTree] Failed to save project folder:', error);
      Message.error(
        folderDialog.mode === 'create-folder'
          ? t('conversation.history.folderCreateFailed')
          : t('conversation.history.folderRenameFailed')
      );
    } finally {
      setDialogLoading(false);
    }
  }, [folderDialog, refreshHierarchy, t]);

  const handleDeleteProject = React.useCallback(
    (group: ProjectFolderGroup) => {
      Modal.confirm({
        title: t('conversation.history.projectDeleteTitle'),
        content: t('conversation.history.projectDeleteConfirm', { name: getProjectGroupName(group, t) }),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            await ipcBridge.projectHierarchy.deleteGroup.invoke({ groupId: group.id });
            refreshHierarchy();
            Message.success(t('conversation.history.projectDeleteSuccess'));
          } catch (error) {
            console.error('[ProjectHierarchyTree] Failed to delete project group:', error);
            Message.error(t('conversation.history.projectDeleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [refreshHierarchy, t]
  );

  const handleDeleteFolder = React.useCallback(
    (folder: ProjectFolder) => {
      Modal.confirm({
        title: t('conversation.history.folderDeleteTitle'),
        content: t('conversation.history.folderDeleteConfirm', { name: folder.name }),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            await ipcBridge.projectHierarchy.deleteFolder.invoke({ folderId: folder.id });
            refreshHierarchy();
            Message.success(t('conversation.history.folderDeleteSuccess'));
          } catch (error) {
            console.error('[ProjectHierarchyTree] Failed to delete project folder:', error);
            Message.error(t('conversation.history.folderDeleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [refreshHierarchy, t]
  );

  const renderProjectMenu = (group: ProjectFolderGroup) => (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'add-folder') {
          openCreateFolderDialog(group);
          return;
        }
        if (key === 'rename-project') {
          openRenameProjectDialog(group);
          return;
        }
        if (key === 'delete-project') {
          handleDeleteProject(group);
        }
      }}
    >
      <Menu.Item key='add-folder'>
        <div className='flex items-center gap-8px'>
          <FolderPlus theme='outline' size='14' />
          <span>{t('conversation.history.addFolder')}</span>
        </div>
      </Menu.Item>
      {group.id !== DEFAULT_GROUP_ID && (
        <Menu.Item key='rename-project'>
          <div className='flex items-center gap-8px'>
            <EditOne theme='outline' size='14' />
            <span>{t('conversation.history.rename')}</span>
          </div>
        </Menu.Item>
      )}
      {group.id !== DEFAULT_GROUP_ID && (
        <Menu.Item key='delete-project'>
          <div className='flex items-center gap-8px text-[rgb(var(--warning-6))]'>
            <DeleteOne theme='outline' size='14' />
            <span>{t('conversation.history.deleteTitle')}</span>
          </div>
        </Menu.Item>
      )}
    </Menu>
  );

  const renderFolderMenu = (group: ProjectFolderGroup, folder: ProjectFolder) => (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'rename-folder') {
          openRenameFolderDialog(group, folder);
          return;
        }
        if (key === 'delete-folder') {
          handleDeleteFolder(folder);
        }
      }}
    >
      <Menu.Item key='rename-folder'>
        <div className='flex items-center gap-8px'>
          <EditOne theme='outline' size='14' />
          <span>{t('conversation.history.rename')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='delete-folder'>
        <div className='flex items-center gap-8px text-[rgb(var(--warning-6))]'>
          <DeleteOne theme='outline' size='14' />
          <span>{t('conversation.history.deleteTitle')}</span>
        </div>
      </Menu.Item>
    </Menu>
  );

  if (collapsed) return null;

  return (
    <div className='mb-8px min-w-0'>
      <div className='px-12px py-8px sticky top-0 z-10 bg-fill-2 flex items-center gap-6px'>
        <span className='text-13px text-t-secondary font-bold leading-20px flex-1 min-w-0'>
          {t('conversation.history.projectsSection')}
        </span>
        <Tooltip content={t('conversation.history.addProject')} position='top'>
          <Button
            size='mini'
            type='text'
            icon={<Plus theme='outline' size='14' />}
            className='!w-24px !h-24px !p-0 !text-t-secondary hover:!text-t-primary'
            onClick={openCreateProjectDialog}
          />
        </Tooltip>
      </div>

      {groups.map((group) => {
        const groupCollapsed = collapsedGroups.has(group.id);
        return (
          <div key={group.id} className='min-w-0'>
            <div
              className='group/project flex items-center gap-6px px-12px py-6px cursor-pointer select-none hover:bg-fill-2 transition-colors'
              onClick={() => toggleGroup(group.id)}
            >
              <span className='text-t-secondary flex-center'>
                {groupCollapsed ? <Right theme='outline' size={12} /> : <Down theme='outline' size={12} />}
              </span>
              <span className='text-13px text-t-primary font-medium truncate flex-1 min-w-0'>
                {getProjectGroupName(group, t)}
              </span>
              <Dropdown
                droplist={renderProjectMenu(group)}
                trigger='click'
                position='br'
                getPopupContainer={() => document.body}
              >
                <span
                  className='flex-center w-22px h-22px rd-4px text-t-secondary hover:text-t-primary hover:bg-fill-3 opacity-0 group-hover/project:opacity-100 transition-all'
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreOne theme='outline' size='14' />
                </span>
              </Dropdown>
            </div>
            {!groupCollapsed &&
              group.folders.map((folder) => {
                const folderConversations = conversationLookup.get(folder.id) ?? [];
                return (
                  <WorkspaceCollapse
                    key={folder.id}
                    expanded={expandedWorkspaces.includes(folder.workspace)}
                    onToggle={() => onToggleWorkspace(folder.workspace)}
                    siderCollapsed={collapsed}
                    header={
                      <div className='group/folder flex items-center gap-8px text-14px min-w-0'>
                        <FolderOpen theme='outline' size='16' fill='var(--color-text-2)' />
                        <Tooltip content={folder.path} position='top'>
                          <span
                            className={classNames('font-medium truncate flex-1 min-w-0', {
                              'text-t-primary': folder.isOpen,
                              'text-t-secondary': !folder.isOpen,
                            })}
                          >
                            {folder.name}
                          </span>
                        </Tooltip>
                        <Badge count={folderConversations.length} dot={folderConversations.length < 10} />
                        <Dropdown
                          droplist={renderFolderMenu(group, folder)}
                          trigger='click'
                          position='br'
                          getPopupContainer={() => document.body}
                        >
                          <span
                            className='flex-center w-22px h-22px rd-4px text-t-secondary hover:text-t-primary hover:bg-fill-3 opacity-0 group-hover/folder:opacity-100 transition-all'
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreOne theme='outline' size='14' />
                          </span>
                        </Dropdown>
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

      {groups.length === 0 && (
        <div className='px-12px py-8px text-12px text-t-tertiary'>{t('conversation.history.projectsEmpty')}</div>
      )}

      <Modal
        title={
          projectDialog?.mode === 'rename-project'
            ? t('conversation.history.renameProjectTitle')
            : t('conversation.history.createProjectTitle')
        }
        visible={projectDialog !== null}
        onOk={handleProjectDialogOk}
        onCancel={() => setProjectDialog(null)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={dialogLoading}
        okButtonProps={{ disabled: !projectDialog?.name.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={projectDialog?.name ?? ''}
          onChange={(name) => setProjectDialog((prev) => (prev ? { ...prev, name } : prev))}
          onPressEnter={() => void handleProjectDialogOk()}
          placeholder={t('conversation.history.projectNamePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        title={
          folderDialog?.mode === 'rename-folder'
            ? t('conversation.history.renameFolderTitle')
            : t('conversation.history.createFolderTitle')
        }
        visible={folderDialog !== null}
        onOk={handleFolderDialogOk}
        onCancel={() => setFolderDialog(null)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={dialogLoading}
        okButtonProps={{ disabled: !folderDialog?.name.trim() || !folderDialog?.workspace.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Form layout='vertical' className='[&_.arco-form-item:last-child]:mb-0'>
          <Form.Item label={t('conversation.history.folderNameLabel')} required>
            <Input
              autoFocus
              value={folderDialog?.name ?? ''}
              onChange={(name) => setFolderDialog((prev) => (prev ? { ...prev, name } : prev))}
              onPressEnter={() => {
                if (folderDialog?.mode === 'rename-folder') void handleFolderDialogOk();
              }}
              placeholder={t('conversation.history.folderNamePlaceholder')}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('conversation.history.folderWorkspaceLabel')} required>
            <WorkspaceFolderSelect
              value={folderDialog?.workspace}
              onChange={(workspace) =>
                setFolderDialog((prev) =>
                  prev
                    ? {
                        ...prev,
                        workspace,
                        name: prev.name || getWorkspaceName(workspace),
                      }
                    : prev
                )
              }
              placeholder={t('conversation.history.folderWorkspacePlaceholder')}
              inputPlaceholder={t('conversation.history.folderWorkspaceInputPlaceholder')}
              recentLabel={t('conversation.history.folderRecentWorkspaces')}
              chooseDifferentLabel={t('conversation.history.folderChooseWorkspace')}
              recentStorageKey='aionui:project-folder-workspaces'
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectHierarchyTree;
