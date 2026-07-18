import { useEffect } from 'react';
import { browserGetState } from './browser-commands';
import { isBrowserTab, useTabsStore } from '../stores/tabs-store';

const RUNTIME_SYNC_INTERVAL_MS = 750;

/** Reconciles SPA navigation that WebView navigation callbacks do not report. */
export function ActiveBrowserRuntimeSync() {
  const hasActiveResidentBrowser = useTabsStore(state => {
    const active = state.tabs.find(tab => tab.id === state.activeTabId);
    return Boolean(active && isBrowserTab(active) && active.lifecycle === 'resident');
  });

  useEffect(() => {
    if (!hasActiveResidentBrowser) return;
    let disposed = false;
    let inFlight = false;

    const sync = async () => {
      if (disposed || inFlight) return;
      const store = useTabsStore.getState();
      const tab = store.tabs.find(candidate => candidate.id === store.activeTabId);
      if (!tab || !isBrowserTab(tab) || tab.lifecycle !== 'resident') return;
      inFlight = true;
      try {
        const runtime = await browserGetState(tab.id);
        const current = useTabsStore.getState().tabs.find(candidate => candidate.id === tab.id);
        if (!disposed && runtime.currentUrl && current && isBrowserTab(current) && runtime.currentUrl !== current.currentUrl) {
          useTabsStore.getState().confirmNavigationEvent(tab.id, runtime.currentUrl);
        }
      } catch {
        // A suspended/closing webview is expected to disappear between ticks.
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), RUNTIME_SYNC_INTERVAL_MS);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [hasActiveResidentBrowser]);

  return null;
}
