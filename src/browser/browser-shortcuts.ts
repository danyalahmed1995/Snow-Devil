/**
 * Sidebar shortcut definitions.
 *
 * Each entry describes a Navigator sidebar item:
 * which tab family it opens, the deterministic tab ID,
 * and (for browser tabs) the URL template to use.
 */

import type { BrowserTabKind } from './browser-url';
import type { NativeTabKind } from './browser-tabs';

import { ENABLE_FLOW_ANALYTICS } from '../config/features';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShortcutDefinition {
  /** Display label in the sidebar. */
  label: string;
  /** Deterministic tab ID. */
  tabId: string;
  /** Tab family. */
  family: 'native' | 'browser';
  /** Kind for native tabs. */
  nativeKind?: NativeTabKind;
  /** Kind for browser tabs. */
  browserKind?: BrowserTabKind;
  /** URL builder for browser tabs (receives the logged-in user's login). */
  urlTemplate?: (login: string) => string;
  /** Whether the tab should be pinned. */
  pinned: boolean;
  /** Whether the tab can be closed. */
  closable: boolean;
}

// ---------------------------------------------------------------------------
// Static sidebar shortcuts
// ---------------------------------------------------------------------------

export const SIDEBAR_SHORTCUTS: ShortcutDefinition[] = [
  {
    label: 'Home',
    tabId: 'native:home',
    family: 'native',
    nativeKind: 'home',
    pinned: true,
    closable: false,
  },
  {
    label: 'Flow',
    tabId: 'native:flow',
    family: 'native',
    nativeKind: 'flow',
    pinned: false,
    closable: true,
  },
  { label: 'CI Activity', tabId: 'native:ci-health', family: 'native', nativeKind: 'ciHealth', pinned: false, closable: true },
  { label: 'Delivery Risks', tabId: 'native:inventory', family: 'native', nativeKind: 'inventory', pinned: false, closable: true },
  ...(ENABLE_FLOW_ANALYTICS ? [{ label: 'Flow Analytics', tabId: 'native:flow-analytics', family: 'native' as const, nativeKind: 'flowAnalytics' as NativeTabKind, pinned: false, closable: true }] : []),
  { label: 'Personal Focus', tabId: 'native:personal-focus', family: 'native', nativeKind: 'personalFocus', pinned: false, closable: true },
  {
    label: 'Account History',
    tabId: 'native:account-simulator',
    family: 'native',
    nativeKind: 'accountSimulator',
    pinned: false,
    closable: true,
  },
  {
    label: 'Repository History',
    tabId: 'native:repository-simulator',
    family: 'native',
    nativeKind: 'repositorySimulator',
    pinned: false,
    closable: true,
  },
  { label: 'Commit Graph', tabId: 'native:commit-graph', family: 'native', nativeKind: 'commitGraph', pinned: false, closable: true },
  { label: 'Settings', tabId: 'native:settings', family: 'native', nativeKind: 'settings', pinned: false, closable: true },
  { label: 'Sketch Board', tabId: 'native:sketch-board', family: 'native', nativeKind: 'sketchBoard', pinned: false, closable: true },
  { label: 'Account', tabId: 'github:profile', family: 'browser', browserKind: 'profile', urlTemplate: (login) => `https://github.com/${login}`, pinned: false, closable: true },
  { label: 'Repositories', tabId: 'github:repositories', family: 'browser', browserKind: 'repositories', urlTemplate: (login) => `https://github.com/${login}?tab=repositories`, pinned: false, closable: true },
  { label: 'Pull requests', tabId: 'github:pull-requests', family: 'browser', browserKind: 'pullRequests', urlTemplate: () => 'https://github.com/pulls', pinned: false, closable: true },
  { label: 'Issues', tabId: 'github:issues', family: 'browser', browserKind: 'issues', urlTemplate: () => 'https://github.com/issues', pinned: false, closable: true },
  { label: 'Notifications', tabId: 'native:notifications', family: 'native', nativeKind: 'notifications', pinned: false, closable: true },
  { label: 'Organizations', tabId: 'native:organizations', family: 'native', nativeKind: 'organizations', pinned: false, closable: true },
];
