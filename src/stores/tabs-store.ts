/**
 * Zustand store for workspace tabs.
 *
 * Supports two tab families:
 * - `NativeTab` – built-in React views (Home, Map, Settings)
 * - `BrowserTab` – webview-backed GitHub pages
 *
 * Persisted to localStorage under `github-graph-browser-tabs`.
 * Includes migration logic from the legacy `system:dashboard` model.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkspaceTab, NativeTab, BrowserTab } from '../browser/browser-tabs';
import type { NativeTabKind } from '../browser/browser-tabs';
import type { BrowserTabKind } from '../browser/browser-url';
import { isNativeTab, isBrowserTab } from '../browser/browser-tabs';

// Re-export type guards for convenience
export { isNativeTab, isBrowserTab };

// Re-export tab types so existing consumers can import from tabs-store
export type { WorkspaceTab, NativeTab, BrowserTab };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------


const DEFAULT_HOME: NativeTab = {
  id: 'native:home',
  family: 'native',
  kind: 'home',
  title: 'Home',
  pinned: true,
  closable: false,
  createdAt: Date.now(),
  lastActivatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface TabsState {
  tabs: WorkspaceTab[];
  activeTabId: string;
  navigationGeneration: number;

  /** Open or focus a native tab. */
  openNativeTab: (
    id: string,
    kind: NativeTabKind,
    title: string,
    pinned?: boolean,
    closable?: boolean,
  ) => void;

  /** Open or focus a browser tab. */
  openBrowserTab: (
    id: string,
    kind: BrowserTabKind,
    title: string,
    url: string,
    pinned?: boolean,
    closable?: boolean,
  ) => void;

  /** Close a tab by ID (no-op for unclosable tabs). */
  closeTab: (id: string) => void;

  /** Activate an existing tab. */
  setActiveTab: (id: string) => void;

  /** Handle a confirmed navigation event from the backend. */
  confirmNavigationEvent: (tabId: string, url: string) => void;

  /** Called when we explicitly navigate the shared webview (from address bar, etc) */
  dispatchNavigation: () => number;

  /** Go back in history for the active tab */
  browserNavigateBack: () => number | undefined;

  /** Go forward in history for the active tab */
  browserNavigateForward: () => number | undefined;

  /** Update the display title for a browser tab. */
  updateBrowserTabTitle: (id: string, title: string) => void;

  /** Update the lifecycle state for a browser tab. */
  updateBrowserTabLifecycle: (id: string, lifecycle: BrowserTab['lifecycle']) => void;

  /** Enforce the 6 resident webview limit. Returns tabs to suspend. */
  enforcePoolLimits: () => string[];

  /** Get the currently active tab (derived). */
  getActiveTab: () => WorkspaceTab | undefined;

  /** Get the currently active tab if it is a browser tab (derived). */
  getActiveBrowserTab: () => BrowserTab | undefined;
}

// ---------------------------------------------------------------------------
// Migration from legacy format
// ---------------------------------------------------------------------------

interface LegacyTab {
  id: string;
  kind: string;
  title: string;
  isPinned?: boolean;
  isClosable?: boolean;
  createdAt?: number;
  lastActivatedAt?: number;
  [key: string]: unknown;
}

function migrateLegacyTabs(raw: unknown): { tabs: WorkspaceTab[]; activeTabId: string } {
  if (!raw || typeof raw !== 'object') {
    return { tabs: [DEFAULT_HOME], activeTabId: 'native:home' };
  }

  const state = raw as { tabs?: LegacyTab[]; activeTabId?: string };
  const oldTabs: LegacyTab[] = Array.isArray(state.tabs) ? state.tabs : [];
  let activeTabId = typeof state.activeTabId === 'string' ? state.activeTabId : 'native:home';

  // Check if already migrated
  const alreadyMigrated = oldTabs.length > 0 && 'family' in oldTabs[0];
  if (alreadyMigrated) {
    if (activeTabId === 'system:dashboard') activeTabId = 'native:home';
    return { tabs: oldTabs as unknown as WorkspaceTab[], activeTabId };
  }

  const migrated: WorkspaceTab[] = [];
  let hasHome = false;

  for (const old of oldTabs) {
    const now = old.createdAt ?? Date.now();
    const lastAct = old.lastActivatedAt ?? now;

    if (old.id === 'system:dashboard' || old.kind === 'dashboard') {
      hasHome = true;
      migrated.push({ ...DEFAULT_HOME, createdAt: now, lastActivatedAt: lastAct });
      if (activeTabId === 'system:dashboard') {
        activeTabId = 'native:home';
      }
    } else if (old.kind === 'map' || old.kind === 'flow') {
      migrated.push({
        id: 'native:flow',
        family: 'native',
        kind: 'flow',
        title: old.title && old.title !== 'Map' ? old.title : 'Flow',
        pinned: old.isPinned ?? false,
        closable: old.isClosable ?? true,
        createdAt: now,
        lastActivatedAt: lastAct,
      } satisfies NativeTab);
    }
  }

  if (!hasHome) {
    migrated.unshift(DEFAULT_HOME);
  }

  if (!migrated.some(t => t.id === activeTabId)) {
    activeTabId = 'native:home';
  }

  return { tabs: migrated, activeTabId };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [DEFAULT_HOME],
      activeTabId: 'native:home',
      navigationGeneration: 1,

      // ---------------------------------------------------------------
      openNativeTab: (id, kind, title, pinned = false, closable = true) => {
        const { tabs, activeTabId } = get();
        const existing = tabs.find(t => t.id === id);
        const now = Date.now();

        if (existing) {
          if (activeTabId !== id) {
            set({
              activeTabId: id,
              tabs: tabs.map(t =>
                t.id === id ? { ...t, lastActivatedAt: now } : t,
              ),
            });
          }
          return;
        }

        const newTab: NativeTab = {
          id,
          family: 'native',
          kind,
          title,
          pinned,
          closable,
          createdAt: now,
          lastActivatedAt: now,
        };

        set({ tabs: [...tabs, newTab], activeTabId: id });
      },

      // ---------------------------------------------------------------
      openBrowserTab: (id, kind, title, url, pinned = false, closable = true) => {
        const { tabs, activeTabId, navigationGeneration } = get();
        const existing = tabs.find(t => t.id === id);
        const now = Date.now();

        if (existing) {
          if (activeTabId !== id) {
            set({
              activeTabId: id,
              navigationGeneration: navigationGeneration + 1,
              tabs: tabs.map(t =>
                t.id === id ? { ...t, lastActivatedAt: now } : t,
              ),
            });
          }
          return;
        }

        const newTab: BrowserTab = {
          id,
          family: 'browser',
          kind,
          title,
          canonicalUrl: url,
          currentUrl: url,
          history: [url],
          historyIndex: 0,
          lifecycle: "uninitialized",
          pinned,
          closable,
          createdAt: now,
          lastActivatedAt: now,
        };

        set({
          tabs: [...tabs, newTab],
          activeTabId: id,
          navigationGeneration: navigationGeneration + 1,
        });
      },

      // ---------------------------------------------------------------
      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const tabToClose = tabs.find(t => t.id === id);

        if (!tabToClose || !tabToClose.closable) return;

        const newTabs = tabs.filter(t => t.id !== id);
        let newActiveId = activeTabId;

        if (activeTabId === id) {
          const index = tabs.findIndex(t => t.id === id);
          if (index > 0) {
            newActiveId = tabs[index - 1].id;
          } else if (newTabs.length > 0) {
            newActiveId = newTabs[0].id;
          } else {
            newActiveId = 'native:home';
          }
        }

        set({ tabs: newTabs, activeTabId: newActiveId });
      },

      // ---------------------------------------------------------------
      setActiveTab: (id) => {
        const { tabs, activeTabId, navigationGeneration } = get();
        if (activeTabId === id) return;
        const now = Date.now();
        if (tabs.some(t => t.id === id)) {
          set({
            activeTabId: id,
            navigationGeneration: navigationGeneration + 1,
            tabs: tabs.map(t =>
              t.id === id ? { ...t, lastActivatedAt: now } : t,
            ),
          });
        }
      },

      // ---------------------------------------------------------------
      confirmNavigationEvent: (tabId, url) => {
        const { tabs } = get();
        
        set({
          tabs: tabs.map(t => {
            if (t.id === tabId && isBrowserTab(t)) {
              // Only append if it's a new URL
              const currentHistoryUrl = t.history[t.historyIndex];
              let newHistory = [...t.history];
              let newIndex = t.historyIndex;
              
              if (url !== currentHistoryUrl && url !== currentHistoryUrl + '/') {
                // Remove forward entries
                newHistory = newHistory.slice(0, t.historyIndex + 1);
                newHistory.push(url);
                newIndex = newHistory.length - 1;
              }
              
              return {
                ...t,
                currentUrl: url,
                history: newHistory,
                historyIndex: newIndex,
              };
            }
            return t;
          })
        });
      },

      // ---------------------------------------------------------------
      dispatchNavigation: () => {
        const gen = get().navigationGeneration + 1;
        set({ navigationGeneration: gen });
        return gen;
      },

      // ---------------------------------------------------------------
      browserNavigateBack: () => {
        const { activeTabId, tabs, navigationGeneration } = get();
        const tab = tabs.find(t => t.id === activeTabId);
        
        if (tab && isBrowserTab(tab) && tab.historyIndex > 0) {
          const gen = navigationGeneration + 1;
          const newIndex = tab.historyIndex - 1;
          const prevUrl = tab.history[newIndex];
          
          set({
            navigationGeneration: gen,
            tabs: tabs.map(t => 
              t.id === activeTabId && isBrowserTab(t) 
                ? { ...t, currentUrl: prevUrl, historyIndex: newIndex }
                : t
            )
          });
          return gen;
        }
        return undefined;
      },

      browserNavigateForward: () => {
        const { activeTabId, tabs, navigationGeneration } = get();
        const tab = tabs.find(t => t.id === activeTabId);
        
        if (tab && isBrowserTab(tab) && tab.historyIndex < tab.history.length - 1) {
          const gen = navigationGeneration + 1;
          const newIndex = tab.historyIndex + 1;
          const nextUrl = tab.history[newIndex];
          
          set({
            navigationGeneration: gen,
            tabs: tabs.map(t => 
              t.id === activeTabId && isBrowserTab(t) 
                ? { ...t, currentUrl: nextUrl, historyIndex: newIndex }
                : t
            )
          });
          return gen;
        }
        return undefined;
      },

      // ---------------------------------------------------------------
      updateBrowserTabTitle: (id, title) => {
        set({
          tabs: get().tabs.map(t =>
            t.id === id && isBrowserTab(t) ? { ...t, title } : t,
          ),
        });
      },

      updateBrowserTabLifecycle: (id, lifecycle) => {
        set({
          tabs: get().tabs.map(t =>
            t.id === id && isBrowserTab(t) ? { ...t, lifecycle } : t,
          ),
        });
      },

      enforcePoolLimits: () => {
        const { tabs, activeTabId } = get();
        const residentTabs = tabs.filter(t => isBrowserTab(t) && t.lifecycle === 'resident');
        
        if (residentTabs.length <= 6) return []; // 6 is the limit

        // Need to evict
        const toEvictCount = residentTabs.length - 6;
        const candidates = residentTabs.filter(t => t.id !== activeTabId);
        
        // Sort by pinned (false first), then lastActivatedAt (oldest first)
        candidates.sort((a, b) => {
           if (a.pinned !== b.pinned) {
              return a.pinned ? 1 : -1;
           }
           return a.lastActivatedAt - b.lastActivatedAt;
        });

        const evictIds = candidates.slice(0, toEvictCount).map(t => t.id);
        
        set({
          tabs: tabs.map(t => 
             evictIds.includes(t.id) && isBrowserTab(t) 
               ? { ...t, lifecycle: 'suspended' } 
               : t
          )
        });

        return evictIds;
      },

      // ---------------------------------------------------------------
      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find(t => t.id === activeTabId);
      },

      getActiveBrowserTab: () => {
        const tab = get().getActiveTab();
        return tab && isBrowserTab(tab) ? tab : undefined;
      },
    }),
    {
      name: 'github-graph-browser-tabs',
      version: 4,
      migrate: (persisted, version) => {
        if (version < 2) {
          const migrated = migrateLegacyTabs(persisted);
          return { ...(persisted as object), ...migrated };
        }
        // Version 2 to 3 transition:
        if (version === 2) {
            const state = persisted as any;
            if (state.tabs) {
                state.tabs = state.tabs.map((t: any) => {
                    if (t.family === 'browser') {
                        return {
                            ...t,
                            canonicalUrl: t.url,
                            currentUrl: t.url,
                            history: [t.url],
                            historyIndex: 0,
                            lifecycle: undefined,
                            error: undefined,
                            webviewLabel: undefined,
                            lastKnownUrl: undefined,
                            url: undefined,
                        };
                    }
                    return t;
                });
            }
            return state;
        }
        if (version === 3) {
            const state = persisted as any;
            if (state.tabs) {
                state.tabs = state.tabs.map((t: any) => {
                    if (t.family === 'native' && t.kind === 'map') {
                        return { ...t, id: 'native:flow', kind: 'flow', title: 'Flow' };
                    }
                    return t;
                });
            }
            if (state.activeTabId === 'native:map') {
                state.activeTabId = 'native:flow';
            }
            return state;
        }
        return persisted as TabsState;
      },
    },
  ),
);
