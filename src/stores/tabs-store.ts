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
import type { NativeTabKind, NativeTabContext } from '../browser/browser-tabs';
import type { BrowserTabKind } from '../browser/browser-url';
import { isNativeTab, isBrowserTab } from '../browser/browser-tabs';
import { normalizeGithubUrl, tabIdForUrl, titleForGithubUrl } from '../browser/browser-url';

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

const NATIVE_KINDS = new Set<NativeTabKind>([
  'home',
  'flow',
  'ciHealth',
  'inventory',
  'flowAnalytics',
  'personalFocus',
  'settings',
  'accountSimulator',
  'repositorySimulator',
  'repositoryExplorer',
  'pullRequestDiff',
  'commitDiff',
  'notifications',
  'organizations',
  'evidenceGraph',
]);

export const FIXED_NATIVE_TAB_IDS: Partial<Record<NativeTabKind, string>> = {
  home: 'native:home',
  flow: 'native:flow',
  ciHealth: 'native:ci-health',
  inventory: 'native:inventory',
  flowAnalytics: 'native:flow-analytics',
  personalFocus: 'native:personal-focus',
  accountSimulator: 'native:account-simulator',
  repositorySimulator: 'native:repository-simulator',
  settings: 'native:settings',
  notifications: 'native:notifications',
  organizations: 'native:organizations',
};

export function fixedNativeTabId(kind: NativeTabKind): string | undefined {
  return FIXED_NATIVE_TAB_IDS[kind];
}

export function isFixedNativeKind(kind: NativeTabKind): boolean {
  return Boolean(fixedNativeTabId(kind));
}

function canonicalFixedTabId(id: string, kind: NativeTabKind): string | undefined {
  if (id.startsWith('native:saved-view:')) return undefined;
  return fixedNativeTabId(kind);
}

export function isFixedNativeTab(tab: NativeTab): boolean {
  return fixedNativeTabId(tab.kind) === tab.id;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNativeContext(tab: Record<string, unknown>): NativeTabContext | undefined {
  const context = tab.context;
  if (!isObject(context)) return undefined;
  if (context.type === 'repository' && typeof context.repository === 'string' && context.repository.includes('/')) {
    return {
      type: 'repository',
      repository: context.repository,
      ref: typeof context.ref === 'string' ? context.ref : undefined,
      path: typeof context.path === 'string' ? context.path : undefined,
    };
  }
  if (context.type === 'pullRequest' && typeof context.repository === 'string' && typeof context.number === 'number') {
    return { type: 'pullRequest', repository: context.repository, number: context.number };
  }
  if (context.type === 'commit' && typeof context.repository === 'string' && typeof context.sha === 'string') {
    return { type: 'commit', repository: context.repository, sha: context.sha };
  }
  if (context.type === 'evidenceGraph') {
    return { type: 'evidenceGraph' };
  }
  return undefined;
}

function normalizeTab(tab: unknown): WorkspaceTab | undefined {
  if (!isObject(tab)) return undefined;
  if (tab.id === 'native:home') {
    return { ...DEFAULT_HOME, ...tab, id: 'native:home', family: 'native', kind: 'home', title: safeString(tab.title, 'Home'), pinned: true, closable: false } as NativeTab;
  }
  if (tab.family === 'native') {
    const kind = NATIVE_KINDS.has(tab.kind as NativeTabKind) ? tab.kind as NativeTabKind : 'home';
    const canonicalId = canonicalFixedTabId(safeString(tab.id), kind);
    const normalized: NativeTab = {
      id: canonicalId ?? safeString(tab.id, `native:${kind}`),
      family: 'native',
      kind,
      title: safeString(tab.title, kind === 'home' ? 'Home' : 'Workspace'),
      pinned: typeof tab.pinned === 'boolean' ? tab.pinned : false,
      closable: typeof tab.closable === 'boolean' ? tab.closable : kind !== 'home',
      createdAt: typeof tab.createdAt === 'number' ? tab.createdAt : Date.now(),
      lastActivatedAt: typeof tab.lastActivatedAt === 'number' ? tab.lastActivatedAt : Date.now(),
      context: normalizeNativeContext(tab),
    };
    if (normalized.kind === 'repositoryExplorer' && normalized.context?.type !== 'repository') return undefined;
    if (normalized.kind === 'pullRequestDiff' && normalized.context?.type !== 'pullRequest') return undefined;
    if (normalized.kind === 'commitDiff' && normalized.context?.type !== 'commit') return undefined;
    if (normalized.kind === 'evidenceGraph' && normalized.context?.type !== 'evidenceGraph') normalized.context = { type: 'evidenceGraph' };
    return normalized;
  }
  if (tab.family === 'browser') {
    const currentUrl = safeString(tab.currentUrl || tab.canonicalUrl);
    if (!currentUrl) return undefined;
    return {
      id: safeString(tab.id, tabIdForUrl(currentUrl)),
      family: 'browser',
      kind: tab.kind as BrowserTabKind,
      title: safeString(tab.title, titleForGithubUrl(currentUrl)),
      canonicalUrl: safeString(tab.canonicalUrl, currentUrl),
      currentUrl,
      history: Array.isArray(tab.history) && tab.history.every(item => typeof item === 'string') ? tab.history : [currentUrl],
      historyIndex: typeof tab.historyIndex === 'number' ? tab.historyIndex : 0,
      isLoading: false,
      error: typeof tab.error === 'string' ? tab.error : undefined,
      parentTabId: typeof tab.parentTabId === 'string' ? tab.parentTabId : undefined,
      lifecycle: 'uninitialized',
      pinned: typeof tab.pinned === 'boolean' ? tab.pinned : false,
      closable: typeof tab.closable === 'boolean' ? tab.closable : true,
      createdAt: typeof tab.createdAt === 'number' ? tab.createdAt : Date.now(),
      lastActivatedAt: typeof tab.lastActivatedAt === 'number' ? tab.lastActivatedAt : Date.now(),
    } satisfies BrowserTab;
  }
  return undefined;
}

function normalizeKnownTab(tab: WorkspaceTab): WorkspaceTab {
  if (tab.id === 'native:home') {
    return { ...tab, pinned: true, closable: false };
  }
  if (tab.id === 'github:profile' && isBrowserTab(tab)) {
    return { ...tab, pinned: false, closable: true };
  }
  if (isNativeTab(tab) && tab.kind === 'accountSimulator') return { ...tab, title: 'Account History' };
  if (isNativeTab(tab) && tab.kind === 'repositorySimulator') return { ...tab, title: 'Repository History' };
  return tab;
}

export function normalizeRestoredTabs(tabs: unknown): WorkspaceTab[] {
  const normalized = (Array.isArray(tabs) ? tabs : []).map(normalizeTab).filter((tab): tab is WorkspaceTab => !!tab).map(normalizeKnownTab);
  const deduplicated = new Map<string, WorkspaceTab>();
  for (const tab of normalized) {
    const previous = deduplicated.get(tab.id);
    if (!previous || tab.lastActivatedAt > previous.lastActivatedAt) deduplicated.set(tab.id, tab);
  }
  const values = [...deduplicated.values()].sort((left, right) => left.createdAt - right.createdAt);
  return values.some(tab => tab.id === DEFAULT_HOME.id) ? values : [{ ...DEFAULT_HOME, createdAt: Date.now(), lastActivatedAt: Date.now() }, ...values];
}

export function normalizeRestoredActiveTabId(rawTabs: unknown, activeTabId: unknown, tabs: WorkspaceTab[]): string {
  if (typeof activeTabId !== 'string' || !Array.isArray(rawTabs)) return 'native:home';
  const raw = rawTabs.find(tab => isObject(tab) && tab.id === activeTabId);
  const normalized = normalizeTab(raw);
  return normalized && tabs.some(tab => tab.id === normalized.id) ? normalized.id : 'native:home';
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface TabsState {
  tabs: WorkspaceTab[];
  activeTabId: string;
  navigationGeneration: number;
  closedTabs: WorkspaceTab[];

  /** Open or focus a native tab. */
  openNativeTab: (
    id: string,
    kind: NativeTabKind,
    title: string,
    pinned?: boolean,
    closable?: boolean,
    context?: NativeTabContext,
  ) => void;

  /** Open or focus a browser tab. */
  openBrowserTab: (
    id: string,
    kind: BrowserTabKind,
    title: string,
    url: string,
    pinned?: boolean,
    closable?: boolean,
    parentTabId?: string,
  ) => void;

  /** Close a tab by ID (no-op for unclosable tabs). */
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  reopenClosedTab: () => void;
  moveTab: (fromId: string, toId: string) => void;

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
  updateBrowserTabLoading: (id: string, isLoading: boolean) => void;
  updateBrowserTabError: (id: string, error?: string) => void;

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
    const restoredActive = oldTabs.find(tab => tab.id === activeTabId);
    const normalizedActive = normalizeTab(restoredActive);
    if (normalizedActive) activeTabId = normalizedActive.id;
    const tabs = normalizeRestoredTabs(oldTabs as unknown as WorkspaceTab[]);
    if (!tabs.some(t => t.id === activeTabId)) activeTabId = 'native:home';
    return { tabs, activeTabId };
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

  const normalized = normalizeRestoredTabs(migrated);

  if (!normalized.some(t => t.id === activeTabId)) {
    activeTabId = 'native:home';
  }

  return { tabs: normalized, activeTabId };
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
      closedTabs: [],

      // ---------------------------------------------------------------
      openNativeTab: (id, kind, title, pinned = false, closable = true, context) => {
        const { tabs } = get();
        const canonicalId = canonicalFixedTabId(id, kind) ?? id;
        const existing = tabs.find(t => t.id === canonicalId);
        const now = Date.now();

        if (existing) {
          set({
            activeTabId: existing.id,
            tabs: tabs.map(t => t.id === existing.id
              ? { ...t, ...(t.family === 'native' && context ? { context } : {}), lastActivatedAt: now }
              : t),
          });
          return;
        }

        const newTab: NativeTab = {
          id: canonicalId,
          family: 'native',
          kind,
          title,
          pinned,
          closable,
          createdAt: now,
          lastActivatedAt: now,
          context,
        };

        set({ tabs: [...tabs, newTab], activeTabId: canonicalId });
      },

      // ---------------------------------------------------------------
      openBrowserTab: (id, kind, title, url, pinned = false, closable = true, parentTabId) => {
        const { tabs, activeTabId, navigationGeneration } = get();
        const canonical = normalizeGithubUrl(url) ?? url;
        const existing = tabs.find(t => t.id === id || isBrowserTab(t) && (normalizeGithubUrl(t.canonicalUrl ?? t.currentUrl) ?? t.canonicalUrl ?? t.currentUrl) === canonical);
        const now = Date.now();

        if (existing) {
          if (activeTabId !== id) {
            set({
              activeTabId: existing.id,
              navigationGeneration: navigationGeneration + 1,
              tabs: tabs.map(t =>
                t.id === existing.id ? { ...t, lastActivatedAt: now } : t,
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
          canonicalUrl: canonical,
          currentUrl: canonical,
          history: [canonical],
          historyIndex: 0,
          isLoading: true,
          parentTabId,
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
        const { tabs, activeTabId, closedTabs } = get();
        const tabToClose = tabs.find(t => t.id === id);

        if (!tabToClose || !tabToClose.closable) return;

        const newTabs = tabs.filter(t => t.id !== id);
        let newActiveId = activeTabId;

        if (activeTabId === id) {
          const index = tabs.findIndex(t => t.id === id);
          if (isBrowserTab(tabToClose) && tabToClose.parentTabId && newTabs.some(tab => tab.id === tabToClose.parentTabId)) {
            newActiveId = tabToClose.parentTabId;
          } else if (index > 0) {
            newActiveId = tabs[index - 1].id;
          } else if (newTabs.length > 0) {
            newActiveId = newTabs[0].id;
          } else {
            newActiveId = 'native:home';
          }
        }

        if (isBrowserTab(tabToClose)) void import('../browser/browser-commands').then(({ browserClose }) => browserClose(id).catch(console.error));
        set({ tabs: newTabs, activeTabId: newActiveId, closedTabs: [tabToClose, ...closedTabs].slice(0, 20) });
      },
      closeOthers: id => {
        const { tabs } = get();
        tabs.filter(tab => tab.id !== id && tab.closable).forEach(tab => get().closeTab(tab.id));
        get().setActiveTab(id);
      },
      closeTabsToRight: id => {
        const { tabs } = get();
        const index = tabs.findIndex(tab => tab.id === id);
        tabs.slice(index + 1).filter(tab => tab.closable).forEach(tab => get().closeTab(tab.id));
      },
      reopenClosedTab: () => {
        const { closedTabs, tabs } = get();
        const [tab, ...remaining] = closedTabs;
        if (!tab) return;
        const restored = normalizeTab({ ...tab, lastActivatedAt: Date.now(), ...(isBrowserTab(tab) ? { lifecycle: 'uninitialized' as const } : {}) });
        if (!restored) { set({ closedTabs: remaining }); return; }
        if (tabs.some(value => value.id === restored.id)) { set({ activeTabId: restored.id, closedTabs: remaining }); return; }
        set({ tabs: [...tabs, restored], activeTabId: restored.id, closedTabs: remaining });
      },
      moveTab: (fromId, toId) => {
        const { tabs } = get();
        const from = tabs.findIndex(tab => tab.id === fromId);
        const to = tabs.findIndex(tab => tab.id === toId);
        if (from < 0 || to < 0 || from === to) return;
        const next = [...tabs];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        set({ tabs: next });
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
                error: undefined,
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

      updateBrowserTabLoading: (id, isLoading) => set({ tabs: get().tabs.map(tab => tab.id === id && isBrowserTab(tab) ? { ...tab, isLoading } : tab) }),
      updateBrowserTabError: (id, error) => set({ tabs: get().tabs.map(tab => tab.id === id && isBrowserTab(tab) ? { ...tab, error, isLoading: error ? false : tab.isLoading } : tab) }),

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
      version: 5,
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
        return persisted;
      },
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        const state = persisted as Partial<TabsState>;
        const tabs = normalizeRestoredTabs(state.tabs);
        const canonicalActiveId = normalizeRestoredActiveTabId(state.tabs, state.activeTabId, tabs);
        return {
          ...current,
          ...state,
          tabs,
          activeTabId: tabs.some(tab => tab.id === canonicalActiveId) ? canonicalActiveId! : 'native:home',
          closedTabs: normalizeRestoredTabs(state.closedTabs ?? []).filter(tab => tab.id !== 'native:home'),
          navigationGeneration: typeof state.navigationGeneration === 'number' ? state.navigationGeneration : current.navigationGeneration,
        };
      },
    },
  ),
);
