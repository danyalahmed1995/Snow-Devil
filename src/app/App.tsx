import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './providers';
import { Layout } from '../components/layout/Layout';
import { useEffect } from 'react';
import { useTabsStore } from '../stores/tabs-store';
import { onBrowserNavigation, onBrowserOpenEntity } from '../browser/browser-events';
import { classifyGithubUrl, tabIdForUrl, titleForGithubUrl } from '../browser/browser-url';
import '../styles/globals.css';
import { CommandPalette } from '../components/palette/CommandPalette';
import { ThemeProvider } from '../components/theme/ThemeProvider';
import { AppErrorBoundary } from '../components/error/AppErrorBoundary';

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
      openBrowserTab(newTabId, kind, title, event.url, false, true);
    });

    return () => {
      unlistenNav.then(u => u());
      unlistenEntity.then(u => u());
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserEventOrchestrator />
      <ThemeProvider />
      <AppErrorBoundary>
        <Layout />
        <CommandPalette />
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
