/**
 * Tauri invoke wrappers for browser (child webview) management.
 *
 * Each function maps 1-to-1 to a Rust `#[tauri::command]` on the backend.
 */

import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pixel-based bounding rectangle for positioning a child webview. */
export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** State snapshot returned by `browser_get_state`. */
export type BrowserStateSnapshot = {
  tab_id: string;
  url: string;
  title: string;
  can_go_back: boolean;
  can_go_forward: boolean;
  is_loading: boolean;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Create the shared child webview. */
export async function browserCreate(
  tabId: string,
  url: string,
  bounds: BrowserBounds,
): Promise<void> {
  return invoke('browser_create', {
    request: { tab_id: tabId, label: 'browser-main', url, bounds },
  });
}

/** Bring the webview for `tabId` to the front and make it visible. */
export async function browserActivate(tabId: string, bounds: BrowserBounds): Promise<void> {
  return invoke('browser_activate', { tabId, bounds });
}

/** Hide all browser webviews (e.g. when switching to a native tab). */
export async function browserHideAll(): Promise<void> {
  return invoke('browser_hide_all');
}

/** Destroy the webview for `tabId` and free its resources. */
export async function browserClose(tabId: string): Promise<void> {
  return invoke('browser_close', { tabId });
}

/** Navigate an existing webview to a new URL. */
export async function browserNavigate(
  tabId: string,
  url: string,
): Promise<void> {
  return invoke('browser_navigate', { tabId, url });
}

/** Go back in the webview's navigation history. */
export async function browserBack(tabId: string): Promise<void> {
  return invoke('browser_back', { tabId });
}

/** Go forward in the webview's navigation history. */
export async function browserForward(tabId: string): Promise<void> {
  return invoke('browser_forward', { tabId });
}

/** Reload the current page in the webview. */
export async function browserReload(tabId: string): Promise<void> {
  return invoke('browser_reload', { tabId });
}

/** Resize / reposition the webview to match new bounds. */
export async function browserResize(
  tabId: string,
  bounds: BrowserBounds,
): Promise<void> {
  return invoke('browser_resize', { tabId, bounds });
}

/** Suspend the webview (free memory, keep state for later restoration). */
export async function browserSuspend(tabId: string): Promise<void> {
  return invoke('browser_suspend', { tabId });
}

/** Clear all browsing data (cookies, cache, local-storage). */
export async function browserClearData(tabId: string): Promise<void> {
  return invoke('browser_clear_data', { tabId });
}

/** Get a state snapshot for the webview associated with `tabId`. */
export async function browserGetState(
  tabId: string,
): Promise<BrowserStateSnapshot> {
  return invoke('browser_get_state', { tabId });
}
