/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import type { ProjectRecord, WorkspaceRecord } from '@/common/types/orgTypes';
import { GENERAL_PROJECT_ID, resolveProjectId, resolveWorkspaceId } from '@/common/types/orgTypes';
import { readOrgExpansion, writeOrgExpansion } from '@/common/utils/orgStorage';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { CronJobIndicator, useCronJobsMap } from '@/renderer/pages/cron';
import {
  useActiveWorkspace,
  useProjectTree,
  useProjects,
  useWorkspaces,
} from '@/renderer/pages/conversation/hooks/org';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Message, Modal, Select } from '@arco-design/web-react';
import { AddOne, FolderOpen, MoreOne } from '@icon-park/react';
import classNames from 'classnames';
import { Down, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import DragOverlayContent from './DragOverlayContent';
import SortableConversationRow from './SortableConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExport } from './hooks/useExport';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

type OrgModalMode = 'create-workspace' | 'rename-workspace' | 'create-project' | 'rename-project';

type OrgModalState = {
  mode: OrgModalMode;
  name: string;
  workspace?: WorkspaceRecord;
  project?: ProjectRecord;
} | null;

const getConversationWorkspaceId = (conversation: TChatConversation): string =>
  resolveWorkspaceId(conversation.extra?.workspace_id);

const getConversationProjectId = (conversation: TChatConversation): string =>
  resolveProjectId(conversation.extra?.project_id);

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [orgModal, setOrgModal] = useState<OrgModalState>(null);
  const [moveConversation, setMoveConversation] = useState<TChatConversation | null>(null);
  const [moveProjectId, setMoveProjectId] = useState<string>(GENERAL_PROJECT_ID);
  const [orgExpansion, setOrgExpansion] = useState(() => readOrgExpansion());
  const { workspaces, createWorkspace, renameWorkspace, deleteWorkspace } = useWorkspaces();
  const { projects, createProject, renameProject, deleteProject } = useProjects();
  const { activeWorkspaceId, setActiveWorkspaceId } = useActiveWorkspace();
  const activeProjectTree = useProjectTree(projects, activeWorkspaceId);
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    writeOrgExpansion(orgExpansion);
  }, [orgExpansion]);

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
  } = useConversations();

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
  });

  const {
    exportTask,
    exportModalVisible,
    exportTargetPath,
    exportModalLoading,
    showExportDirectorySelector,
    setShowExportDirectorySelector,
    closeExportModal,
    handleSelectExportDirectoryFromModal,
    handleSelectExportFolder,
    handleExportConversation,
    handleBatchExport,
    handleConfirmExport,
  } = useExport({
    conversations,
    selectedConversationIds,
    setSelectedConversationIds,
    onBatchModeChange,
  });

  const { sensors, activeId, activeConversation, handleDragStart, handleDragEnd, handleDragCancel, isDragEnabled } =
    useDragAndDrop({
      pinnedConversations,
      batchMode,
      collapsed,
    });

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const visibleProjects = useMemo(
    () => projects.filter((project) => project.workspace_id === (activeWorkspace?.id || activeWorkspaceId)),
    [activeWorkspace?.id, activeWorkspaceId, projects]
  );

  const conversationsByProject = useMemo(() => {
    const map = new Map<string, TChatConversation[]>();
    conversations.forEach((conversation) => {
      if (getConversationWorkspaceId(conversation) !== (activeWorkspace?.id || activeWorkspaceId)) return;
      const projectId = getConversationProjectId(conversation);
      const items = map.get(projectId) ?? [];
      items.push(conversation);
      map.set(projectId, items);
    });
    map.forEach((items) => items.sort((a, b) => b.modifyTime - a.modifyTime));
    return map;
  }, [activeWorkspace?.id, activeWorkspaceId, conversations]);

  const recentsConversations = useMemo(
    () =>
      conversations
        .filter(
          (conversation) => getConversationWorkspaceId(conversation) === (activeWorkspace?.id || activeWorkspaceId)
        )
        .toSorted((a, b) => b.modifyTime - a.modifyTime)
        .slice(0, 8),
    [activeWorkspace?.id, activeWorkspaceId, conversations]
  );

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        label: `${workspaces.find((workspace) => workspace.id === project.workspace_id)?.name || ''} / ${project.name}`,
        value: project.id,
      })),
    [projects, workspaces]
  );

  const handleOrgModalOk = useCallback(() => {
    if (!orgModal) return;
    if (orgModal.mode === 'create-workspace') {
      const workspace = createWorkspace(orgModal.name);
      if (workspace) setActiveWorkspaceId(workspace.id);
    } else if (orgModal.mode === 'rename-workspace' && orgModal.workspace) {
      renameWorkspace(orgModal.workspace.id, orgModal.name);
    } else if (orgModal.mode === 'create-project') {
      createProject(activeWorkspace?.id || activeWorkspaceId, orgModal.name);
    } else if (orgModal.mode === 'rename-project' && orgModal.project) {
      renameProject(orgModal.project.id, orgModal.name);
    }
    setOrgModal(null);
  }, [
    activeWorkspace?.id,
    activeWorkspaceId,
    createProject,
    createWorkspace,
    orgModal,
    renameProject,
    renameWorkspace,
    setActiveWorkspaceId,
  ]);

  const handleMoveConfirm = useCallback(async () => {
    if (!moveConversation) return;
    const project = projects.find((item) => item.id === moveProjectId);
    if (!project) return;
    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: moveConversation.id,
        updates: {
          extra: {
            workspace_id: project.workspace_id,
            project_id: project.id,
          } as Partial<TChatConversation['extra']>,
        } as Partial<TChatConversation>,
        mergeExtra: true,
      });
      if (success) {
        Message.success(t('conversation.org.moveSuccess'));
        setMoveConversation(null);
      } else {
        Message.error(t('conversation.org.moveFailed'));
      }
    } catch {
      Message.error(t('conversation.org.moveFailed'));
    }
  }, [moveConversation, moveProjectId, projects, t]);

  const handleMoveToProject = useCallback((conversation: TChatConversation) => {
    setMoveConversation(conversation);
    setMoveProjectId(getConversationProjectId(conversation));
  }, []);

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      hasCompletionUnread: hasCompletionUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onDelete: handleDeleteClick,
      onExport: handleExportConversation,
      onTogglePin: handleTogglePin,
      onMoveToProject: handleMoveToProject,
      getJobStatus,
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      hasCompletionUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleDeleteClick,
      handleExportConversation,
      handleTogglePin,
      handleMoveToProject,
      getJobStatus,
    ]
  );

  const renderConversation = (conversation: TChatConversation) => {
    const rowProps = getConversationRowProps(conversation);
    return <ConversationRow key={conversation.id} {...rowProps} />;
  };

  const renderProjectSection = (project: ProjectRecord) => {
    const isCollapsed = orgExpansion.projects[project.id] === false;
    const projectConversations = conversationsByProject.get(project.id) ?? [];
    return (
      <div key={project.id} className='mb-4px min-w-0'>
        {!collapsed && (
          <div
            className='flex items-center gap-6px px-12px py-7px cursor-pointer select-none rounded-8px hover:bg-fill-2'
            onClick={() =>
              setOrgExpansion((prev) => ({
                ...prev,
                projects: { ...prev.projects, [project.id]: isCollapsed },
              }))
            }
          >
            <span className='text-13px'>{project.icon || '▣'}</span>
            <span className='text-13px text-t-primary font-medium truncate flex-1'>{project.name}</span>
            <Dropdown
              trigger='click'
              position='br'
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    if (key === 'rename') {
                      setOrgModal({ mode: 'rename-project', name: project.name, project });
                    } else if (key === 'delete') {
                      deleteProject(project.id);
                    }
                  }}
                >
                  <Menu.Item key='rename'>{t('conversation.org.renameProject')}</Menu.Item>
                  {!project.is_default && <Menu.Item key='delete'>{t('conversation.org.deleteProject')}</Menu.Item>}
                </Menu>
              }
            >
              <span
                className='h-20px w-20px flex-center rd-4px hover:bg-fill-3'
                onClick={(event) => event.stopPropagation()}
              >
                <MoreOne theme='outline' size={14} />
              </span>
            </Dropdown>
            <span className='h-20px w-20px flex-center text-t-secondary'>
              {isCollapsed ? <Right theme='outline' size={12} /> : <Down theme='outline' size={12} />}
            </span>
          </div>
        )}
        {!isCollapsed && (
          <div className={classNames('flex flex-col gap-2px min-w-0', { 'pl-10px': !collapsed })}>
            {projectConversations.length > 0 ? (
              projectConversations.map((conversation) => renderConversation(conversation))
            ) : !collapsed ? (
              <div className='px-12px py-6px text-12px text-t-tertiary'>{t('conversation.org.emptyProject')}</div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  const showEmptyHistory = conversations.length === 0 && pinnedConversations.length === 0;

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        visible={exportModalVisible}
        title={t('conversation.history.exportDialogTitle')}
        onCancel={closeExportModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='conversation-export-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>
            {exportTask?.mode === 'batch'
              ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversationIds.length })
              : t('conversation.history.exportDialogSingleDescription')}
          </div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span
                className='text-14px overflow-hidden text-ellipsis whitespace-nowrap'
                style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
              >
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <span>💡</span>
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal
        visible={showExportDirectorySelector}
        onConfirm={handleSelectExportDirectoryFromModal}
        onCancel={() => setShowExportDirectorySelector(false)}
      />

      <Modal
        title={orgModal ? t(`conversation.org.${orgModal.mode}`) : ''}
        visible={Boolean(orgModal)}
        onOk={handleOrgModalOk}
        onCancel={() => setOrgModal(null)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !orgModal?.name.trim() }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={orgModal?.name || ''}
          onChange={(name) => setOrgModal((prev) => (prev ? { ...prev, name } : prev))}
          onPressEnter={handleOrgModalOk}
          placeholder={t('conversation.org.namePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        title={t('conversation.org.moveToProject')}
        visible={Boolean(moveConversation)}
        onOk={() => void handleMoveConfirm()}
        onCancel={() => setMoveConversation(null)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Select value={moveProjectId} onChange={setMoveProjectId} options={projectOptions} className='w-full' />
      </Modal>

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleBatchExport}
              >
                {t('conversation.history.batchExport')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                onClick={handleBatchDelete}
              >
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        {!collapsed && activeWorkspace && (
          <div className='px-12px pb-8px'>
            <div className='flex items-center gap-6px mb-8px'>
              <Select
                size='small'
                value={activeWorkspace.id}
                onChange={setActiveWorkspaceId}
                className='flex-1 min-w-0'
                options={workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id }))}
              />
              <Button
                size='mini'
                icon={<AddOne theme='outline' />}
                onClick={() => setOrgModal({ mode: 'create-workspace', name: '' })}
              />
              <Dropdown
                trigger='click'
                position='br'
                droplist={
                  <Menu
                    onClickMenuItem={(key) => {
                      if (key === 'rename') {
                        setOrgModal({
                          mode: 'rename-workspace',
                          name: activeWorkspace.name,
                          workspace: activeWorkspace,
                        });
                      } else if (key === 'delete') {
                        deleteWorkspace(activeWorkspace.id);
                        setActiveWorkspaceId(workspaces[0]?.id || activeWorkspaceId);
                      }
                    }}
                  >
                    <Menu.Item key='rename'>{t('conversation.org.renameWorkspace')}</Menu.Item>
                    {!activeWorkspace.is_default && (
                      <Menu.Item key='delete'>{t('conversation.org.deleteWorkspace')}</Menu.Item>
                    )}
                  </Menu>
                }
              >
                <Button size='mini' icon={<MoreOne theme='outline' />} />
              </Dropdown>
            </div>
            <Button
              size='mini'
              type='secondary'
              className='!w-full !justify-center'
              icon={<AddOne theme='outline' />}
              onClick={() => setOrgModal({ mode: 'create-project', name: '' })}
            >
              {t('conversation.org.newProject')}
            </Button>
          </div>
        )}

        {showEmptyHistory && (
          <div className='py-48px flex-center'>
            <Empty description={t('conversation.history.noHistory')} />
          </div>
        )}

        {recentsConversations.length > 0 && (
          <div className='mb-8px min-w-0'>
            {!collapsed && (
              <div
                className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                onClick={() => toggleSection('org-recents')}
              >
                <span className='text-13px text-t-secondary font-bold leading-20px'>
                  {t('conversation.org.recents')}
                </span>
                <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                  {collapsedSections.has('org-recents') ? (
                    <Right theme='outline' size={12} />
                  ) : (
                    <Down theme='outline' size={12} />
                  )}
                </div>
              </div>
            )}
            {!collapsedSections.has('org-recents') && (
              <div className='min-w-0'>
                {recentsConversations.map((conversation) => renderConversation(conversation))}
              </div>
            )}
          </div>
        )}

        {visibleProjects.length > 0 && (
          <div className='mb-8px min-w-0'>{activeProjectTree.map((project) => renderProjectSection(project))}</div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {pinnedConversations.length > 0 && (
            <div className='mb-8px min-w-0'>
              {!collapsed && (
                <div
                  className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                  onClick={() => toggleSection('pinned')}
                >
                  <span className='text-13px text-t-secondary font-bold leading-20px'>
                    {t('conversation.history.pinnedSection')}
                  </span>
                  <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                    {collapsedSections.has('pinned') ? (
                      <Right theme='outline' size={12} />
                    ) : (
                      <Down theme='outline' size={12} />
                    )}
                  </div>
                </div>
              )}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeId && activeConversation ? <DragOverlayContent conversation={activeConversation} /> : null}
          </DragOverlay>
        </DndContext>

        {timelineSections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {!collapsed && (
              <div
                className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                onClick={() => toggleSection(section.timeline)}
              >
                <span className='text-13px text-t-secondary font-bold leading-20px'>{section.timeline}</span>
                <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                  {collapsedSections.has(section.timeline) ? (
                    <Right theme='outline' size={12} />
                  ) : (
                    <Down theme='outline' size={12} />
                  )}
                </div>
              </div>
            )}

            {!collapsedSections.has(section.timeline) &&
              section.items.map((item) => {
                if (item.type === 'workspace' && item.workspaceGroup) {
                  const group = item.workspaceGroup;
                  return (
                    <div key={group.workspace} className='min-w-0'>
                      <WorkspaceCollapse
                        expanded={expandedWorkspaces.includes(group.workspace)}
                        onToggle={() => handleToggleWorkspace(group.workspace)}
                        siderCollapsed={collapsed}
                        header={
                          <div className='flex items-center gap-8px text-14px min-w-0'>
                            <span className='font-medium truncate flex-1 text-t-primary min-w-0'>
                              {group.displayName}
                            </span>
                          </div>
                        }
                      >
                        <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-2px': !collapsed })}>
                          {group.conversations.map((conversation) => renderConversation(conversation))}
                        </div>
                      </WorkspaceCollapse>
                    </div>
                  );
                }

                if (item.type === 'conversation' && item.conversation) {
                  return renderConversation(item.conversation);
                }

                return null;
              })}
          </div>
        ))}
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;
