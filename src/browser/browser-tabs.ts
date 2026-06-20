/**
 * Tab type definitions for the Snow Devil browser-core pivot.
 *
 * Two families:
 * - `NativeTab` – built-in React views (Home, Map, Settings).
 * - `BrowserTab` – webview-backed GitHub pages with lifecycle tracking.
 */

import type { BrowserTabKind } from './browser-url';

// ---------------------------------------------------------------------------
// Native tabs
// ---------------------------------------------------------------------------

/** Sub-kinds for native (non-webview) tabs. */
export type NativeTabKind = "home" | "map" | "settings";

/** A tab backed by a built-in React view. */
export type NativeTab = {
  id: string;
  family: "native";
  kind: NativeTabKind;
  title: string;
  pinned: boolean;
  closable: boolean;
  createdAt: number;
  lastActivatedAt: number;
};

// ---------------------------------------------------------------------------
// Browser tabs
// ---------------------------------------------------------------------------

export type BrowserLifecycle =
  | "uninitialized"
  | "creating"
  | "resident"
  | "suspending"
  | "suspended"
  | "activating"
  | "error";

/** A tab backed by the Tauri child webview pool showing a GitHub page. */
export type BrowserTab = {
  id: string;
  family: "browser";
  kind: BrowserTabKind;
  title: string;
  canonicalUrl?: string;
  currentUrl: string;
  history: string[];
  historyIndex: number;
  lifecycle: BrowserLifecycle;
  pinned: boolean;
  closable: boolean;
  createdAt: number;
  lastActivatedAt: number;
};

// ---------------------------------------------------------------------------
// Union & type guards
// ---------------------------------------------------------------------------

/** Discriminated union of all tab types. */
export type WorkspaceTab = NativeTab | BrowserTab;

/** Type guard: returns `true` if the tab is a native tab. */
export function isNativeTab(tab: WorkspaceTab): tab is NativeTab {
  return tab.family === "native";
}

/** Type guard: returns `true` if the tab is a browser (webview) tab. */
export function isBrowserTab(tab: WorkspaceTab): tab is BrowserTab {
  return tab.family === "browser";
}
