/**
 * Core type definitions for Git worktree environments.
 *
 * Separation of concerns:
 * - RepositoryIdentity: shared remote GitHub data
 * - WorktreeInfo: one concrete local checkout discovered from git
 * - WorktreeEnvironment: persisted app record for a worktree
 * - WorktreeContext: stable, minimal context passed to consumers
 */

/** Remote GitHub repository identity. */
export type RepositoryIdentity = {
  /** "owner/name" format, e.g. "acme/my-app" */
  nameWithOwner: string;
  /** GitHub database ID when known — stable across renames */
  repositoryDatabaseId?: string;
};

/** Status of a worktree as determined by git and filesystem inspection. */
export type WorktreeStatus =
  | 'clean'      // no uncommitted changes
  | 'dirty'      // has modified or staged files
  | 'missing'    // path no longer exists on disk
  | 'locked'     // git worktree locked
  | 'prunable'   // git considers this worktree prunable
  | 'detached'   // detached HEAD (no branch)
  | 'bare'       // bare repository worktree
  | 'unknown';   // could not determine status

/** Raw worktree information from `git worktree list --porcelain`. */
export type WorktreeInfo = {
  /** Internal identity key: canonical absolute path (with platform prefix) */
  worktreeId: string;
  /** Canonical path as returned by OS (may include \\?\ on Windows) */
  canonicalPath: string;
  /** User-facing path (\\?\ stripped, forward slashes) */
  displayPath: string;
  /** Short branch name, e.g. "main" */
  branch: string | null;
  /** Full git ref, e.g. "refs/heads/main" */
  branchRef: string | null;
  /** Current HEAD commit SHA */
  headSha: string | null;
  /** True for the primary (main) worktree */
  isMain: boolean;
  /** True when in detached HEAD state */
  isDetached: boolean;
  /** True for bare worktrees */
  isBare: boolean;
  /** True if git has locked this worktree */
  isLocked: boolean;
  /** Reason the worktree is locked, if provided */
  lockedReason: string | null;
  /** True if git considers this worktree prunable */
  isPrunable: boolean;
  /** Reason the worktree is prunable, if provided */
  prunableReason: string | null;
};

/** Aggregate git status for a worktree. */
export type WorktreeGitStatus = {
  modifiedCount: number;
  untrackedCount: number;
  stagedCount: number;
  hasConflicts: boolean;
  isClean: boolean;
  branch: string | null;
  headSha: string | null;
  ahead: number;
  behind: number;
};

/** A single file's diff output. */
export type WorktreeFileDiff = {
  filePath: string;
  oldPath: string | null;
  /** M=modified, A=added, D=deleted, R=renamed, U=unmerged */
  status: 'M' | 'A' | 'D' | 'R' | 'U' | string;
  diffText: string;
  isBinary: boolean;
};

/** Per-file status from `git status --porcelain`. */
export type WorktreeFileStatus = {
  /** Path relative to the worktree root */
  path: string;
  /** Old path (only set for renamed files) */
  oldPath: string | null;
  /** Index (staged) status character */
  indexStatus: string;
  /** Working-tree status character */
  workingTreeStatus: string;
};

/** Persisted app record for a discovered worktree environment. */
export type WorktreeEnvironment = {
  /** Stable identity: canonical path (with platform prefix) */
  worktreeId: string;
  /** Canonical path to the parent repository's main worktree */
  repositoryRootPath: string;
  /** Human-friendly name (defaults to branch name) */
  friendlyName: string;
  /** When first discovered/created by Snow Devil (Unix ms) */
  discoveredAt: number;
  /** When last opened as the active environment (Unix ms) */
  lastOpenedAt: number;
};

/**
 * Minimal stable context passed to consumers (tabs, terminal, agents, etc.).
 * Contains only what is needed to address files and run commands.
 */
export type WorktreeContext = {
  /** Stable identity key */
  worktreeId: string;
  /** Path to parent repo main worktree */
  repositoryRootPath: string;
  /** User-facing display path */
  displayPath: string;
  /** Branch short name or null */
  branch: string | null;
  /** Human-friendly name */
  friendlyName: string;
};

/** A local file read from the filesystem. */
export type WorktreeLocalFile = {
  /** Path relative to worktree root */
  path: string;
  /** Absolute display path */
  fullPath: string;
  /** File text content (null for binary files) */
  text: string | null;
  byteSize: number;
  isBinary: boolean;
  /** MIME type hint based on extension */
  mimeHint: string | null;
  /** Base64 content for binary/image files */
  contentBase64: string | null;
};

/** A local directory entry. */
export type WorktreeLocalEntry = {
  name: string;
  /** Relative to worktree root */
  path: string;
  fullPath: string;
  isDir: boolean;
  sizeBytes: number;
  isSymlink: boolean;
};

/** Path metadata from stat_local_path. */
export type WorktreePathMeta = {
  exists: boolean;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
  sizeBytes: number;
  canonicalPath: string;
  displayPath: string;
};
