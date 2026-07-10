import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './providers';
import { Layout } from '../components/layout/Layout';
import { useEffect } from 'react';
import { useTabsStore } from '../stores/tabs-store';
import { onBrowserError, onBrowserLoadFinished, onBrowserLoadStarted, onBrowserNavigation, onBrowserOpenEntity, onBrowserTitle } from '../browser/browser-events';
import { classifyGithubUrl, tabIdForUrl, titleForGithubUrl } from '../browser/browser-url';
import '../styles/globals.css';
import { CommandPalette } from '../components/palette/CommandPalette';
import { ThemeProvider } from '../components/theme/ThemeProvider';
import { AppErrorBoundary } from '../components/error/AppErrorBoundary';
import { ActiveBrowserRuntimeSync } from '../browser/ActiveBrowserRuntimeSync';
import { TooltipProvider } from '../components/ui/Tooltip';
import { NotificationRuntime } from '../components/notifications/NotificationRuntime';
import { CIWatcherRuntime } from '../components/ci/CIWatcherRuntime';
import { OpenPullRequestRuntime } from '../components/workspace/OpenPullRequestRuntime';

function BrowserEventOrchestrator() {
  useEffect(() => {
    // 1. Address bar sync (browser:navigation)
    const unlistenNav = onBrowserNavigation((event) => {
      const state = useTabsStore.getState();
      state.confirmNavigationEvent(event.tabId, event.url);
    });

    // 2. Open entity from singleton (browser:open-entity)
    const unlistenEntity = onBrowserOpenEntity((event) => {
      const { openBrowserTab } = useTabsStore.getState();
      const kind = classifyGithubUrl(event.url);
      const newTabId = tabIdForUrl(event.url); // Use semantic tab ID without login (login isn't needed for entities)
      const title = titleForGithubUrl(event.url);
      openBrowserTab(newTabId, kind, title, event.url, false, true, event.tabId);
    });
    const unlistenTitle = onBrowserTitle(event => useTabsStore.getState().updateBrowserTabTitle(event.tabId, event.title));
    const unlistenError = onBrowserError(event => useTabsStore.getState().updateBrowserTabError(event.tabId, event.error));
    const unlistenStarted = onBrowserLoadStarted(event => { const state = useTabsStore.getState(); state.updateBrowserTabError(event.tabId, undefined); state.updateBrowserTabLoading(event.tabId, true); });
    const unlistenFinished = onBrowserLoadFinished(event => useTabsStore.getState().updateBrowserTabLoading(event.tabId, false));

    return () => {
      unlistenNav.then(u => u());
      unlistenEntity.then(u => u());
      unlistenTitle.then(u => u());
      unlistenError.then(u => u());
      unlistenStarted.then(u => u());
      unlistenFinished.then(u => u());
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserEventOrchestrator />
      <ActiveBrowserRuntimeSync />
      <ThemeProvider />
      <AppErrorBoundary>
        <TooltipProvider>
          <NotificationRuntime />
          <CIWatcherRuntime />
          <OpenPullRequestRuntime />
          <Layout />
          <CommandPalette />
        </TooltipProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
