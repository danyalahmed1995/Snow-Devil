import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CIWorkflowRun } from '../ci/ci-watcher';

export type CIRepositoryStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'offline' | 'rate_limited' | 'permission_denied' | 'unavailable' | 'error';
interface CIRepositoryState { status: CIRepositoryStatus; message?: string; lastSuccessAt?: string }
interface CIWatcherStore {
  activeAccount?: string;
  runsByRepository: Record<string, CIWorkflowRun[]>;
  repositoryState: Record<string, CIRepositoryState>;
  subscriptions: Record<string, number>;
  setActiveAccount: (login?: string) => void;
  setRuns: (repository: string, runs: CIWorkflowRun[]) => void;
  setRepositoryStatus: (repository: string, status: CIRepositoryStatus, message?: string) => void;
  subscribe: (repository: string) => void;
  unsubscribe: (repository: string) => void;
  clear: () => void;
}

const MAX_REPOSITORIES = 24;
const MAX_RUNS = 20;

export const useCIWatcherStore = create<CIWatcherStore>()(persist((set) => ({
  runsByRepository: {}, repositoryState: {}, subscriptions: {},
  setActiveAccount: login => set(state => {
    const normalized = login?.toLowerCase();
    if (normalized === state.activeAccount) return state;
    return { activeAccount: normalized, runsByRepository: {}, repositoryState: {}, subscriptions: {} };
  }),
  setRuns: (repository, runs) => set(state => {
    const key = repository.toLowerCase();
    const existing = state.runsByRepository[key] || [];
    const merged = new Map<string, CIWorkflowRun>();
    for (const run of existing) merged.set(run.id, run);
    for (const run of runs) {
      const prev = merged.get(run.id);
      if (!prev || run.updatedAt >= prev.updatedAt) merged.set(run.id, run);
    }
    const finalRuns = Array.from(merged.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_RUNS);
    const entries = Object.entries({ ...state.runsByRepository, [key]: finalRuns }).slice(-MAX_REPOSITORIES);
    return { runsByRepository: Object.fromEntries(entries), repositoryState: { ...state.repositoryState, [key]: { status: 'ready', lastSuccessAt: new Date().toISOString() } } };
  }),
  setRepositoryStatus: (repository, status, message) => set(state => ({ repositoryState: { ...state.repositoryState, [repository.toLowerCase()]: { ...state.repositoryState[repository.toLowerCase()], status, message } } })),
  subscribe: repository => set(state => ({ subscriptions: { ...state.subscriptions, [repository.toLowerCase()]: (state.subscriptions[repository.toLowerCase()] ?? 0) + 1 } })),
  unsubscribe: repository => set(state => { const subscriptions = { ...state.subscriptions }; const key = repository.toLowerCase(); if ((subscriptions[key] ?? 0) <= 1) delete subscriptions[key]; else subscriptions[key] -= 1; return { subscriptions }; }),
  clear: () => set({ runsByRepository: {}, repositoryState: {}, subscriptions: {} }),
}), { name: 'snow-devil-ci-watch', version: 1, partialize: state => ({ activeAccount: state.activeAccount, runsByRepository: state.runsByRepository, repositoryState: state.repositoryState }) }));
