/**
 * Zustand store for Git worktree environments.
 *
 * Persisted state (key: 'snow-devil-worktrees', version: 1):
 *   - environments: Record<worktreeId, WorktreeEnvironment>
 *   - activeWorktreeId: Record<repositoryRootPath, worktreeId>
 *
 * Runtime-only state (reset on hydration):
 *   - discoveredWorktrees: Record<repositoryRootPath, WorktreeInfo[]>
 *   - discoveryStatus: Record<repositoryRootPath, DiscoveryStatus>
 *   - discoveryError: Record<repositoryRootPath, string | null>
 *   - gitStatus: Record<worktreeId, WorktreeGitStatus>
 *   - _inflight: Set<repositoryRootPath> — coalesces concurrent discoverWorktrees calls
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type {
  WorktreeInfo,
  WorktreeEnvironment,
  WorktreeGitStatus,
  WorktreeContext,
} from './worktree-types';
import {
  worktreeDisplayPath,
  friendlyNameFromBranch,
} from './worktree-identity';

type DiscoveryStatus = 'idle' | 'loading' | 'error';

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

/** Runtime-only state — not persisted, always reset to EMPTY_RUNTIME on hydration. */
interface WorktreeRuntimeState {
  discoveredWorktrees: Record<string, WorktreeInfo[]>;
  discoveryStatus: Record<string, DiscoveryStatus>;
  discoveryError: Record<string, string | null>;
  gitStatus: Record<string, WorktreeGitStatus>;
  /** In-flight discovery calls to prevent duplicate concurrent requests. */
  _inflight: Set<string>;
}

/** Persisted state — serialised to localStorage. */
interface WorktreePersistedState {
  environments: Record<string, WorktreeEnvironment>;
  /** Active worktreeId keyed by repositoryRootPath. */
  activeWorktreeId: Record<string, string>;
  /** The currently open repository session in the environments manager. */
  repositorySession: {
    repositoryRootPath: string;
    selectedWorktreeId: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface WorktreeActions {
  /**
   * Discover all worktrees for a repository.
   * Concurrent calls for the same path are coalesced (only one in-flight at a time).
   * Calls `invoke('worktree_list', { repoPath })`.
   */
  discoverWorktrees(repositoryRootPath: string): Promise<void>;

  /**
   * Refresh git status for a single worktree.
   * Calls `invoke('worktree_status', { worktreePath })`.
   * Failures are silently ignored to avoid disrupting the UI.
   */
  refreshStatus(worktreeId: string): Promise<void>;

  /** Update the active worktree for a specific repository. */
  setActiveWorktree: (repositoryRootPath: string, worktreeId: string) => void;

  /** Open a repository session in the environments manager. */
  openRepositorySession: (repositoryRootPath: string) => void;

  /** Close the repository session in the environments manager. */
  closeRepositorySession: () => void;

  /** Update the selected worktree in the environments manager. */
  setSelectedWorktreeId: (worktreeId: string | null) => void;

  /** Upsert environment data (typically tracked per-worktree). */
  upsertEnvironment(env: WorktreeEnvironment): void;

  /** Remove a persisted environment record. */
  removeEnvironment(worktreeId: string): void;

  /**
   * Get the active WorktreeInfo for a repository (runtime, not persisted).
   * Returns `undefined` if no worktrees have been discovered yet.
   */
  getActiveWorktreeInfo(repositoryRootPath: string): WorktreeInfo | undefined;

  /**
   * Get a minimal stable WorktreeContext for consumers (tabs, terminal, agents).
   * Returns `undefined` if the environment is not yet persisted.
   */
  getWorktreeContext(worktreeId: string): WorktreeContext | undefined;

  /** Internal: set discovered worktrees after a successful list. */
  _setDiscoveredWorktrees(
    repositoryRootPath: string,
    worktrees: WorktreeInfo[],
  ): void;
}

type WorktreeStore = WorktreePersistedState & WorktreeRuntimeState & WorktreeActions;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_RUNTIME: WorktreeRuntimeState = {
  discoveredWorktrees: {},
  discoveryStatus: {},
  discoveryError: {},
  gitStatus: {},
  _inflight: new Set(),
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorktreeStore = create<WorktreeStore>()(
  persist(
    (set, get) => ({
      // --- Persisted ----------------------------------------------------------
      environments: {},
      activeWorktreeId: {},
      repositorySession: null,

      // --- Runtime ------------------------------------------------------------
      ...EMPTY_RUNTIME,

      // --- Actions ------------------------------------------------------------

      discoverWorktrees: async (repositoryRootPath) => {
        const { _inflight } = get();
        if (_inflight.has(repositoryRootPath)) return;
        _inflight.add(repositoryRootPath);

        set((s) => ({
          discoveryStatus: {
            ...s.discoveryStatus,
            [repositoryRootPath]: 'loading',
          },
          discoveryError: {
            ...s.discoveryError,
            [repositoryRootPath]: null,
          },
        }));

        try {
          const worktrees = await invoke<WorktreeInfo[]>('worktree_list', {
            repoPath: repositoryRootPath,
          });

          get()._setDiscoveredWorktrees(repositoryRootPath, worktrees);

          // Upsert environment records for newly-discovered worktrees
          const { environments } = get();
          for (const wt of worktrees) {
            if (!environments[wt.worktreeId]) {
              get().upsertEnvironment({
                worktreeId: wt.worktreeId,
                repositoryRootPath,
                friendlyName: friendlyNameFromBranch(wt.branch, wt.displayPath),
                discoveredAt: Date.now(),
                lastOpenedAt: Date.now(),
              });
            }
          }

          // Auto-select the main worktree if none is active yet
          const { activeWorktreeId } = get();
          if (!activeWorktreeId[repositoryRootPath]) {
            const main = worktrees.find((w) => w.isMain);
            if (main) {
              get().setActiveWorktree(repositoryRootPath, main.worktreeId);
            }
          }

          set((s) => ({
            discoveryStatus: {
              ...s.discoveryStatus,
              [repositoryRootPath]: 'idle',
            },
          }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : String(error);

          set((s) => ({
            discoveryStatus: {
              ...s.discoveryStatus,
              [repositoryRootPath]: 'error',
            },
            discoveryError: {
              ...s.discoveryError,
              [repositoryRootPath]: message,
            },
          }));
        } finally {
          get()._inflight.delete(repositoryRootPath);
        }
      },

      refreshStatus: async (worktreeId) => {
        try {
          const status = await invoke<WorktreeGitStatus>('worktree_status', {
            worktreePath: worktreeId,
          });
          set((s) => ({
            gitStatus: { ...s.gitStatus, [worktreeId]: status },
          }));
        } catch {
          // Silently ignore individual status failures — UI degrades gracefully
        }
      },

      setActiveWorktree: (repositoryRootPath, worktreeId) => {
        set((s) => ({
          activeWorktreeId: {
            ...s.activeWorktreeId,
            [repositoryRootPath]: worktreeId,
          },
        }));
        // Bump lastOpenedAt so the most-recently-used worktree is trackable
        const { environments } = get();
        const env = environments[worktreeId];
        if (env) {
          get().upsertEnvironment({ ...env, lastOpenedAt: Date.now() });
        }
      },

      openRepositorySession: (repositoryRootPath) => {
        set({ repositorySession: { repositoryRootPath, selectedWorktreeId: null } });
      },

      closeRepositorySession: () => {
        set({ repositorySession: null });
      },

      setSelectedWorktreeId: (worktreeId) => {
        set((s) => ({
          repositorySession: s.repositorySession
            ? { ...s.repositorySession, selectedWorktreeId: worktreeId }
            : null,
        }));
      },

      upsertEnvironment: (env) => {
        set((s) => ({
          environments: { ...s.environments, [env.worktreeId]: env },
        }));
      },

      removeEnvironment: (worktreeId) => {
        set((s) => {
          const environments = { ...s.environments };
          delete environments[worktreeId];
          return { environments };
        });
      },

      getActiveWorktreeInfo: (repositoryRootPath) => {
        const { activeWorktreeId, discoveredWorktrees } = get();
        const activeId = activeWorktreeId[repositoryRootPath];
        if (!activeId) return undefined;
        return discoveredWorktrees[repositoryRootPath]?.find(
          (w) => w.worktreeId === activeId,
        );
      },

      getWorktreeContext: (worktreeId) => {
        const { environments, discoveredWorktrees } = get();
        const env = environments[worktreeId];
        if (!env) return undefined;
        // Find runtime info from any repo's discovered list
        const allDiscovered = Object.values(discoveredWorktrees).flat();
        const info = allDiscovered.find((w) => w.worktreeId === worktreeId);
        
        // Return a stable representation to avoid React dependency loops
        // since Zustand strict equality fails on new objects.
        return {
          worktreeId,
          repositoryRootPath: env.repositoryRootPath,
          displayPath: worktreeDisplayPath(worktreeId),
          branch: info?.branch ?? null,
          friendlyName: env.friendlyName,
        };
      },

      _setDiscoveredWorktrees: (repositoryRootPath, worktrees) => {
        set((s) => ({
          discoveredWorktrees: {
            ...s.discoveredWorktrees,
            [repositoryRootPath]: worktrees,
          },
        }));
      },
    }),
    {
      name: 'snow-devil-worktrees',
      version: 1,
      /**
       * Only persist environments and activeWorktreeId.
       * Runtime state (discoveredWorktrees, discoveryStatus, gitStatus, _inflight)
       * is intentionally excluded and reset to EMPTY_RUNTIME on every hydration.
       */
      partialize: (state) => ({
        environments: state.environments,
        activeWorktreeId: state.activeWorktreeId,
        repositorySession: state.repositorySession,
      }),
      /**
       * On hydration, merge persisted state into current, but always override
       * runtime fields with EMPTY_RUNTIME so stale discovery data is never loaded.
       */
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WorktreeStore>),
        // Always reset runtime state on hydration
        ...EMPTY_RUNTIME,
      }),
    },
  ),
);
