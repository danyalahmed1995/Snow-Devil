import { useRef, useEffect, useCallback } from 'react';
import { browserCreate, browserResize, browserActivate, type BrowserBounds } from './browser-commands';
import { useTabsStore, isBrowserTab } from '../stores/tabs-store';

function measureSafeBounds(el: HTMLElement | null): BrowserBounds | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  
  if (
    rect.width <= 0 || 
    rect.height <= 0 || 
    rect.x < 0 || 
    rect.y < 0 || 
    Number.isNaN(rect.x) || 
    Number.isNaN(rect.y) || 
    Number.isNaN(rect.width) || 
    Number.isNaN(rect.height)
  ) {
    return null;
  }

  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function BrowserViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const isBrowser = activeTab && isBrowserTab(activeTab);
  
  const lastSyncRef = useRef<{ tabId: string; url: string; bounds: BrowserBounds } | null>(null);

  const performSync = useCallback(() => {
    if (!activeTab || !isBrowserTab(activeTab)) return;

    let raf2: number;

    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const bounds = measureSafeBounds(containerRef.current);
        if (!bounds) return;

        const currentUrl = activeTab.currentUrl;
        const prev = lastSyncRef.current;
        
        const needsResize = !prev || 
          prev.bounds.x !== bounds.x ||
          prev.bounds.y !== bounds.y ||
          prev.bounds.width !== bounds.width ||
          prev.bounds.height !== bounds.height;
        const needsActivate = !prev || prev.tabId !== activeTab.id;

        if (!needsResize && !needsActivate && activeTab.lifecycle === 'resident') {
          // Already fully synced
          return;
        }

        const store = useTabsStore.getState();
        store.updateBrowserTabLifecycle(activeTab.id, 'creating');

        // 1. Create or Resize
        browserCreate(activeTab.id, currentUrl, bounds)
          .then(() => {
            if (needsResize) {
              return browserResize(activeTab.id, bounds);
            }
          })
          .then(() => {
            // Enforce limits via React state, but Rust already enforces it internally on creation
            store.updateBrowserTabLifecycle(activeTab.id, 'activating');

            // 2. Activate (Show & Focus)
            if (needsActivate || needsResize) {
              lastSyncRef.current = { tabId: activeTab.id, url: currentUrl, bounds };
              return browserActivate(activeTab.id, bounds);
            }
          })
          .then(() => {
             store.updateBrowserTabLifecycle(activeTab.id, 'resident');
             const evicted = store.enforcePoolLimits();
             // The rust backend already closed the webview if it hit the limit, but we also manually sync
             // any extra ones we need to suspend
             evicted.forEach(id => {
                import('./browser-commands').then(({ browserSuspend }) => browserSuspend(id).catch(console.error));
             });
          })
          .catch((err) => {
            console.error("Failed to sync shared browser tab", err);
            store.updateBrowserTabLifecycle(activeTab.id, 'error');
            lastSyncRef.current = null;
          });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [activeTabId, activeTab]);

  // Track tab selection or URL changes
  useEffect(() => {
    const cleanup = performSync();
    return cleanup;
  }, [activeTabId, isBrowser ? (activeTab as any).currentUrl : undefined, performSync]);

  // Keep exactly one persistent ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cleanupSync: (() => void) | undefined;

    const observer = new ResizeObserver(() => {
      if (cleanupSync) cleanupSync();
      cleanupSync = performSync();
    });

    observer.observe(el);
    return () => {
      if (cleanupSync) cleanupSync();
      observer.disconnect();
    };
  }, [performSync]);

  return (
    <div
      ref={containerRef}
      className="browser-viewport"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* The actual webview is positioned here by Tauri – no iframe */}
    </div>
  );
}
