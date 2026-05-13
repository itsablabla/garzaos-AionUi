import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { useOptionalConversationTabs } from '@/renderer/pages/conversation/hooks/ConversationTabsContext';
import { isElectronDesktop } from '@/renderer/utils/platform';

type UseConversationShortcutsParams = {
  navigate: NavigateFunction;
};

const getCycledConversationId = (
  visibleConversationIds: string[],
  activeConversationId: string | null,
  direction: 1 | -1
): string | null => {
  if (visibleConversationIds.length < 2 || !activeConversationId) {
    return null;
  }

  const activeIndex = visibleConversationIds.findIndex((conversationId) => conversationId === activeConversationId);
  if (activeIndex === -1) {
    return null;
  }

  const nextIndex = (activeIndex + direction + visibleConversationIds.length) % visibleConversationIds.length;
  return visibleConversationIds[nextIndex] ?? null;
};

const isConversationTabShortcut = (event: KeyboardEvent): boolean => {
  return event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab';
};

const isNewConversationShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 't';
};

const isCloseTabShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w';
};

const getJumpTabIndex = (event: KeyboardEvent): number | null => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
  const index = Number(event.key);
  if (!Number.isInteger(index) || index < 1 || index > 9) return null;
  return index - 1;
};

export const useConversationShortcuts = ({ navigate }: UseConversationShortcutsParams): void => {
  const location = useLocation();
  const visibleConversationIds = useVisibleConversationIds();
  const tabs = useOptionalConversationTabs();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (!isElectronDesktop()) {
        return;
      }

      if (isConversationTabShortcut(event)) {
        event.preventDefault();
        const currentConversationId = location.pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null;
        const targetConversationId = getCycledConversationId(
          visibleConversationIds,
          currentConversationId,
          event.shiftKey ? -1 : 1
        );

        if (targetConversationId) {
          void navigate(`/conversation/${targetConversationId}`);
        }
        return;
      }

      const jumpTabIndex = getJumpTabIndex(event);
      if (jumpTabIndex !== null && tabs?.openTabs[jumpTabIndex]) {
        event.preventDefault();
        const targetTabId = tabs.openTabs[jumpTabIndex].id;
        tabs.switchTab(targetTabId);
        void navigate(`/conversation/${targetTabId}`);
        return;
      }

      if (isCloseTabShortcut(event) && tabs?.activeTabId) {
        event.preventDefault();
        const closingTabId = tabs.activeTabId;
        const closingIndex = tabs.openTabs.findIndex((tab) => tab.id === closingTabId);
        const fallbackTab = tabs.openTabs[closingIndex - 1] || tabs.openTabs[closingIndex + 1] || null;
        tabs.closeTab(closingTabId);
        void navigate(fallbackTab ? `/conversation/${fallbackTab.id}` : '/guid');
        return;
      }

      if (isNewConversationShortcut(event)) {
        event.preventDefault();
        void navigate('/guid');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [location.pathname, navigate, tabs, visibleConversationIds]);
};
