/**
 * Sidebar shortcut definitions.
 *
 * Each entry describes a Navigator sidebar item:
 * which tab family it opens, the deterministic tab ID,
 * and (for browser tabs) the URL template to use.
 */

import type { BrowserTabKind } from './browser-url';
import type { NativeTabKind } from './browser-tabs';

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
    label: 'Account',
    tabId: 'github:profile',
    family: 'browser',
    browserKind: 'profile',
    urlTemplate: (login) => `https://github.com/${login}`,
    pinned: true,
    closable: false,
  },
  {
    label: 'Organizations',
    tabId: 'github:organizations',
    family: 'browser',
    browserKind: 'organizations',
    urlTemplate: () => 'https://github.com/settings/organizations',
    pinned: false,
    closable: true,
  },
  {
    label: 'Repositories',
    tabId: 'github:repositories',
    family: 'browser',
    browserKind: 'repositories',
    urlTemplate: (login) => `https://github.com/${login}?tab=repositories`,
    pinned: false,
    closable: true,
  },
  {
    label: 'Pull requests',
    tabId: 'github:pull-requests',
    family: 'browser',
    browserKind: 'pullRequests',
    urlTemplate: () => 'https://github.com/pulls',
    pinned: false,
    closable: true,
  },
  {
    label: 'Issues',
    tabId: 'github:issues',
    family: 'browser',
    browserKind: 'issues',
    urlTemplate: () => 'https://github.com/issues',
    pinned: false,
    closable: true,
  },
  {
    label: 'Notifications',
    tabId: 'github:notifications',
    family: 'browser',
    browserKind: 'notifications',
    urlTemplate: () => 'https://github.com/notifications',
    pinned: false,
    closable: true,
  },
  {
    label: 'Flow',
    tabId: 'native:flow',
    family: 'native',
    nativeKind: 'flow',
    pinned: false,
    closable: true,
  },
];
