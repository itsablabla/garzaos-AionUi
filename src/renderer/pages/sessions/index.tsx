/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Empty, Input, Message, Modal, Select, Spin, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Add, Delete, FolderOpen, Left, Play, Pushpin, Right, Search, Star } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  filterSessionsForCenter,
  getSessionBackendKey,
  getSessionBackendOptions,
  getSessionCategory,
  getSessionGroupLabel,
  isSessionFavorited,
  isSessionPinned,
  isVisibleSession,
  SESSION_CATEGORIES,
  type SessionCategory,
  type SessionFilters,
  sortSessionsForCenter,
  splitSessionsIntoRecentAndArchive,
} from './utils';

const BACKEND_LABEL: Record<string, { label: string; color: string }> = {
  claude: { label: 'Claude Code', color: 'blue' },
  gemini: { label: 'Gemini', color: 'green' },
  qwen: { label: 'Qwen', color: 'orangered' },
  codex: { label: 'Codex', color: 'purple' },
  codebuddy: { label: 'CodeBuddy', color: 'cyan' },
  opencode: { label: 'OpenCode', color: 'gold' },
  aionrs: { label: 'AionRS', color: 'arcoblue' },
};

type ConversationExtra = {
  backend?: string;
  teamId?: string;
};

type SessionCardProps = {
  conversation: TChatConversation;
  onDelete: (conversationId: string) => void;
  onTogglePin: (conversation: TChatConversation) => void;
  onToggleFavorite: (conversation: TChatConversation) => void;
  onChangeCategory: (conversation: TChatConversation, category: SessionCategory | undefined) => void;
};

const getBackendInfo = (conversation: TChatConversation): { label: string; color: string } => {
  const backend = getSessionBackendKey(conversation);
  return BACKEND_LABEL[backend] ?? { label: backend, color: 'arcoblue' };
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SessionCard: React.FC<SessionCardProps> = ({
  conversation,
  onDelete,
  onTogglePin,
  onToggleFavorite,
  onChangeCategory,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const backend = getBackendInfo(conversation);
  const pinned = isSessionPinned(conversation);
  const favorited = isSessionFavorited(conversation);
  const hasTeam = Boolean((conversation.extra as ConversationExtra | undefined)?.teamId);
  const category = getSessionCategory(conversation);
  const groupLabel = getSessionGroupLabel(conversation);

  const openConversation = () => {
    void navigate(`/conversation/${conversation.id}`);
  };

  return (
    <div
      className='mb-8px rd-10px border border-solid border-[var(--color-border-2)] bg-bg-2 px-16px py-12px cursor-pointer transition-colors hover:border-[rgb(var(--primary-6))]'
      onClick={openConversation}
    >
      <div className='flex items-center justify-between gap-12px'>
        <div className='flex items-center gap-8px min-w-0'>
          <span
            className='h-8px w-8px rd-50% shrink-0'
            style={{
              backgroundColor: conversation.status === 'running' ? 'rgb(var(--success-6))' : 'var(--color-text-4)',
            }}
          />
          <Typography.Ellipsis className='text-14px font-600 text-t-primary min-w-0'>
            {conversation.name || t('conversation.welcome.newConversation')}
          </Typography.Ellipsis>
          <Tag size='small' color={backend.color} className='shrink-0'>
            {backend.label}
          </Tag>
          {hasTeam && (
            <Tag size='small' color='purple' className='shrink-0'>
              {t('team.sider.title')}
            </Tag>
          )}
          {groupLabel && (
            <Tag size='small' color='arcoblue' className='shrink-0'>
              {groupLabel}
            </Tag>
          )}
          {category && (
            <Tag size='small' color='gold' className='shrink-0'>
              {t(`conversation.sessions.category.${category}`)}
            </Tag>
          )}
        </div>
        <div className='flex items-center gap-4px shrink-0' onClick={(event) => event.stopPropagation()}>
          <Tooltip content={favorited ? t('conversation.history.unfavorite') : t('conversation.history.favorite')}>
            <Button
              type='text'
              size='mini'
              icon={<Star theme={favorited ? 'filled' : 'outline'} size={14} />}
              onClick={() => onToggleFavorite(conversation)}
            />
          </Tooltip>
          <Tooltip content={pinned ? t('conversation.history.unpin') : t('conversation.history.pin')}>
            <Button
              type='text'
              size='mini'
              icon={<Pushpin theme={pinned ? 'filled' : 'outline'} size={14} />}
              onClick={() => onTogglePin(conversation)}
            />
          </Tooltip>
          <Tooltip content={t('conversation.sessions.continue')}>
            <Button type='text' size='mini' icon={<Play theme='outline' size={14} />} onClick={openConversation} />
          </Tooltip>
          <Tooltip content={t('common.delete')}>
            <Button
              type='text'
              size='mini'
              status='danger'
              icon={<Delete theme='outline' size={14} />}
              onClick={() => onDelete(conversation.id)}
            />
          </Tooltip>
        </div>
      </div>
      <div className='mt-10px flex items-center gap-8px' onClick={(event) => event.stopPropagation()}>
        <span className='text-12px text-t-tertiary'>{t('conversation.sessions.categoryLabel')}</span>
        <Select
          size='mini'
          value={category ?? 'none'}
          className='w-180px'
          onChange={(value) => {
            onChangeCategory(conversation, value === 'none' ? undefined : (value as SessionCategory));
          }}
        >
          <Select.Option value='none'>{t('conversation.sessions.category.none')}</Select.Option>
          {SESSION_CATEGORIES.map((item) => (
            <Select.Option key={item} value={item}>
              {t(`conversation.sessions.category.${item}`)}
            </Select.Option>
          ))}
        </Select>
      </div>
      <div className='mt-6px flex flex-wrap gap-x-16px gap-y-4px text-12px text-t-tertiary'>
        <span>{t('conversation.sessions.modifiedAt', { time: formatTime(conversation.modifyTime) })}</span>
        <span>{t('conversation.sessions.createdAt', { time: formatTime(conversation.createTime) })}</span>
      </div>
    </div>
  );
};

const SessionsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SessionFilters>({
    query: '',
    backend: 'all',
    status: 'all',
    category: 'all',
    date: '',
  });
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipcBridge.database.getUserConversations.invoke({ page: 0, pageSize: 10000 });
      setConversations(sortSessionsForCenter(data.filter(isVisibleSession)));
    } catch (error) {
      console.error('Failed to load sessions:', error);
      Message.error(t('conversation.sessions.loadFailed'));
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConversations();
    const unsubscribe = ipcBridge.conversation.listChanged.on(() => {
      void loadConversations();
    });
    return () => unsubscribe();
  }, [loadConversations]);

  const updateSessionExtra = useCallback(
    async (conversation: TChatConversation, extra: Partial<TChatConversation['extra']>, errorKey: string) => {
      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: { extra } as Partial<TChatConversation>,
          mergeExtra: true,
        });
        if (!success) {
          Message.error(t(errorKey));
          return;
        }
        emitter.emit('chat.history.refresh');
        await loadConversations();
      } catch (error) {
        console.error('Failed to update session:', error);
        Message.error(t(errorKey));
      }
    },
    [loadConversations, t]
  );

  const handleTogglePin = useCallback(
    (conversation: TChatConversation) => {
      const pinned = isSessionPinned(conversation);
      void updateSessionExtra(
        conversation,
        {
          pinned: !pinned,
          pinnedAt: pinned ? undefined : Date.now(),
        } as Partial<TChatConversation['extra']>,
        'conversation.history.pinFailed'
      );
    },
    [updateSessionExtra]
  );

  const handleToggleFavorite = useCallback(
    (conversation: TChatConversation) => {
      const favorited = isSessionFavorited(conversation);
      void updateSessionExtra(
        conversation,
        {
          favorited: !favorited,
          favoritedAt: favorited ? undefined : Date.now(),
        } as Partial<TChatConversation['extra']>,
        'conversation.history.favoriteFailed'
      );
    },
    [updateSessionExtra]
  );

  const handleChangeCategory = useCallback(
    (conversation: TChatConversation, category: SessionCategory | undefined) => {
      void updateSessionExtra(
        conversation,
        {
          sessionKind: category,
        } as Partial<TChatConversation['extra']>,
        'conversation.sessions.categoryUpdateFailed'
      );
    },
    [updateSessionExtra]
  );

  const handleDelete = useCallback(
    (conversationId: string) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await ipcBridge.conversation.remove.invoke({ id: conversationId });
            if (!success) {
              Message.error(t('conversation.history.deleteFailed'));
              return;
            }
            emitter.emit('conversation.deleted', conversationId);
            emitter.emit('chat.history.refresh');
            setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
            Message.success(t('conversation.history.deleteSuccess'));
          } catch (error) {
            console.error('Failed to delete session:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t]
  );

  const backendOptions = useMemo(() => getSessionBackendOptions(conversations), [conversations]);
  const filtered = useMemo(() => filterSessionsForCenter(conversations, filters), [conversations, filters]);
  const { recent, folders } = useMemo(() => splitSessionsIntoRecentAndArchive(filtered), [filtered]);
  const activeFolder = useMemo(() => {
    if (!activeDateKey) return null;
    return folders.find((folder) => folder.key === activeDateKey) ?? null;
  }, [activeDateKey, folders]);

  const renderSessionCard = (conversation: TChatConversation) => (
    <SessionCard
      key={conversation.id}
      conversation={conversation}
      onDelete={handleDelete}
      onTogglePin={handleTogglePin}
      onToggleFavorite={handleToggleFavorite}
      onChangeCategory={handleChangeCategory}
    />
  );

  return (
    <div className='h-full flex flex-col px-24px py-20px bg-bg-1'>
      <div className='mb-16px flex items-center justify-between gap-12px'>
        <div className='flex items-center gap-10px min-w-0'>
          {activeDateKey && (
            <Button type='text' icon={<Left theme='outline' size={16} />} onClick={() => setActiveDateKey(null)}>
              {t('common.historyBack')}
            </Button>
          )}
          <h2 className='m-0 text-18px font-700 text-t-primary'>
            {activeDateKey
              ? t('conversation.sessions.folderTitleWithDate', { date: activeDateKey })
              : t('conversation.sessions.title')}
          </h2>
        </div>
        <Button type='primary' icon={<Add theme='outline' />} size='small' onClick={() => navigate('/guid')}>
          {t('conversation.sessions.new')}
        </Button>
      </div>

      <Input
        prefix={<Search theme='outline' size={14} />}
        placeholder={t('conversation.sessions.searchPlaceholder')}
        value={filters.query}
        onChange={(value) => {
          setFilters((prev) => ({ ...prev, query: value }));
          setActiveDateKey(null);
        }}
        className='mb-16px'
        allowClear
      />

      <div className='mb-16px grid grid-cols-4 gap-8px'>
        <Select
          size='small'
          value={filters.status}
          onChange={(value) => setFilters((prev) => ({ ...prev, status: value as SessionFilters['status'] }))}
        >
          <Select.Option value='all'>{t('conversation.sessions.filter.allStatuses')}</Select.Option>
          <Select.Option value='favorite'>{t('conversation.sessions.filter.favorites')}</Select.Option>
          <Select.Option value='pinned'>{t('conversation.sessions.filter.pinned')}</Select.Option>
          <Select.Option value='team'>{t('conversation.sessions.filter.team')}</Select.Option>
        </Select>
        <Select
          size='small'
          value={filters.category}
          onChange={(value) => setFilters((prev) => ({ ...prev, category: value as SessionFilters['category'] }))}
        >
          <Select.Option value='all'>{t('conversation.sessions.filter.allCategories')}</Select.Option>
          {SESSION_CATEGORIES.map((category) => (
            <Select.Option key={category} value={category}>
              {t(`conversation.sessions.category.${category}`)}
            </Select.Option>
          ))}
        </Select>
        <Select
          size='small'
          value={filters.backend}
          onChange={(value) => setFilters((prev) => ({ ...prev, backend: value }))}
        >
          <Select.Option value='all'>{t('conversation.sessions.filter.allBackends')}</Select.Option>
          {backendOptions.map((backend) => (
            <Select.Option key={backend} value={backend}>
              {BACKEND_LABEL[backend]?.label ?? backend}
            </Select.Option>
          ))}
        </Select>
        <Input
          size='small'
          value={filters.date}
          placeholder={t('conversation.sessions.filter.datePlaceholder')}
          onChange={(value) => {
            setFilters((prev) => ({ ...prev, date: value.trim() }));
            setActiveDateKey(null);
          }}
          allowClear
        />
      </div>

      <div className='flex-1 overflow-y-auto min-h-0'>
        {loading ? (
          <div className='py-48px flex-center'>
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <div className='py-48px'>
            <Empty
              description={filters.query ? t('conversation.sessions.emptySearch') : t('conversation.sessions.empty')}
            />
            {!filters.query && (
              <div className='mt-16px flex justify-center'>
                <Button type='primary' icon={<Add theme='outline' />} onClick={() => navigate('/guid')}>
                  {t('conversation.sessions.startFirst')}
                </Button>
              </div>
            )}
          </div>
        ) : activeDateKey ? (
          (activeFolder?.conversations ?? []).map(renderSessionCard)
        ) : (
          <>
            <div className='mb-10px text-12px text-t-tertiary'>{t('conversation.sessions.recentLimitNote')}</div>
            {recent.map(renderSessionCard)}
            {folders.length > 0 && (
              <div className='mt-10px'>
                <div className='my-8px text-13px font-700 text-t-secondary'>
                  {t('conversation.sessions.archiveByDate')}
                </div>
                {folders.map((folder) => (
                  <div
                    key={folder.key}
                    className='mb-8px flex items-center justify-between gap-12px rd-10px border border-solid border-[var(--color-border-2)] bg-bg-2 px-14px py-10px cursor-pointer transition-colors hover:border-[rgb(var(--primary-6))]'
                    onClick={() => setActiveDateKey(folder.key)}
                  >
                    <div className='flex items-center gap-12px min-w-0 flex-1'>
                      <span className='h-28px w-28px rd-8px flex-center shrink-0 bg-[rgba(var(--primary-6),0.10)] border border-solid border-[rgba(var(--primary-6),0.18)] text-primary'>
                        <FolderOpen theme='outline' size={18} />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-10px min-w-0'>
                          <span className='font-700 text-t-primary'>{folder.key}</span>
                          <Tag size='small' color='arcoblue'>
                            {t('conversation.sessions.count', { count: folder.count })}
                          </Tag>
                          {folder.lastModify > 0 && (
                            <span className='text-12px text-t-tertiary'>{formatTime(folder.lastModify)}</span>
                          )}
                        </div>
                        <Typography.Ellipsis className='mt-4px text-12px text-t-tertiary'>
                          {folder.subtitle || t('conversation.sessions.folderSubtitleFallback')}
                        </Typography.Ellipsis>
                      </div>
                    </div>
                    <Right theme='outline' size={16} className='shrink-0 text-t-secondary' />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;
