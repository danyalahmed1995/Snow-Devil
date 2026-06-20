/**
 * Event listeners for Tauri browser (child webview) events.
 *
 * All events are emitted from the Rust backend via `app.emit(…)`.
 * Each listener returns an `UnlistenFn` that should be called on cleanup.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export type BrowserNavigationEvent = {
  tabId: string;
  webviewLabel: string;
  url: string;
};

export type BrowserTitleEvent = {
  tabId: string;
  title: string;
};

export type BrowserErrorEvent = {
  tabId: string;
  error: string;
};

export type BrowserTabEvent = {
  tabId: string;
};

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

/** Fired when the webview navigates to a new URL. */
export function onBrowserNavigation(
  callback: (event: BrowserNavigationEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserNavigationEvent>('browser:navigation', (e) =>
    callback(e.payload),
  );
}

/** Fired when a singleton webview tries to navigate to an entity. */
export function onBrowserOpenEntity(
  callback: (event: BrowserNavigationEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserNavigationEvent>('browser:open-entity', (e) =>
    callback(e.payload),
  );
}

/** Fired when the page title changes in a webview. */
export function onBrowserTitle(
  callback: (event: BrowserTitleEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserTitleEvent>('browser:title-changed', (e) =>
    callback(e.payload),
  );
}

/** Fired when the webview encounters an error. */
export function onBrowserError(
  callback: (event: BrowserErrorEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserErrorEvent>('browser:error', (e) =>
    callback(e.payload),
  );
}

/** Fired when a webview has been successfully created. */
export function onBrowserCreated(
  callback: (event: BrowserTabEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserTabEvent>('browser:created', (e) =>
    callback(e.payload),
  );
}

/** Fired when a webview has been destroyed. */
export function onBrowserClosed(
  callback: (event: BrowserTabEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserTabEvent>('browser:closed', (e) =>
    callback(e.payload),
  );
}

/** Fired when page loading starts in a webview. */
export function onBrowserLoadStarted(
  callback: (event: BrowserTabEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserTabEvent>('browser:load-started', (e) =>
    callback(e.payload),
  );
}

/** Fired when page loading completes in a webview. */
export function onBrowserLoadFinished(
  callback: (event: BrowserTabEvent) => void,
): Promise<UnlistenFn> {
  return listen<BrowserTabEvent>('browser:load-finished', (e) =>
    callback(e.payload),
  );
}
