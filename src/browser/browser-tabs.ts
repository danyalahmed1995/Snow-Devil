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
export type NativeTabKind =
  | "home"
  | "flow"
  | "ciHealth"
  | "inventory"
  | "flowAnalytics"
  | "personalFocus"
  | "settings"
  | "accountSimulator"
  | "repositorySimulator"
  | "repositoryExplorer"
  | "pullRequestDiff"
  | "commitDiff"
  | "ciRun"
  | "notifications"
  | "organizations"
  | "evidenceGraph"
  | "worktreeEnvironments"
  | "worktreeLocalExplorer"
  | "worktreeLocalFile"
  | "worktreeChanges";

export type NativeTabContext =
  | { type: "repository"; repository: string; ref?: string; path?: string }
  | { type: "pullRequest"; repository: string; number: number }
  | { type: "commit"; repository: string; sha: string }
  | {
      type: "ciRun";
      owner?: string;
      repository: string;
      repositoryId?: string | number;
      runId: string;
      runNumber?: number;
      attempt?: number;
      selectedJobId?: string;
      selectedJobName?: string;
      /**
       * Legacy alias kept for existing persisted tabs and open-call sites.
       * New writes should use selectedJobId.
       */
      jobId?: string;
      schemaVersion?: number;
    }
  | { type: "evidenceGraph"; rootId?: string; repository?: string }
  | {
      /**
       * Context for worktree-scoped local tabs (explorer, file viewer, changes).
       * Including worktreeId ensures two different worktrees with the same
       * relative file path open separate, distinct tabs.
       */
      type: "worktreeLocal";
      repositoryRootPath: string;
      worktreeId: string;
      /** Sub-route hint used by the tab renderer (e.g. 'worktreeLocalFile'). */
      subRoute?: string;
      /** For file tabs: path relative to the worktree root. */
      filePath?: string;
    }
  | {
      /** Context for the worktree environments manager tab. */
      type: "worktreeEnvironments";
      repositoryRootPath: string;
      defaultBranchName?: string;
      defaultBranchBase?: string;
      linkSourceItemType?: "pr" | "issue" | "ci" | "branch" | "manual";
      linkSourceItemId?: string;
      linkSourceRepositoryId?: string;
    };

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
  context?: NativeTabContext;
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
  isLoading?: boolean;
  error?: string;
  parentTabId?: string;
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
