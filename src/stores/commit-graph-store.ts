import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_COMMIT_GRAPH_FILTERS, type CommitGraphFilters } from '../commit-graph/topology';

export interface CommitGraphViewState {
  repository?: { id: string; nameWithOwner: string };
  branch?: string;
  selectedSha?: string;
  compareBaseSha?: string;
  scrollTop: number;
  filters: CommitGraphFilters;
}

interface CommitGraphStore {
  view: CommitGraphViewState;
  byScope: Record<string, Pick<CommitGraphViewState, 'selectedSha' | 'scrollTop'>>;
  patch: (value: Partial<CommitGraphViewState>) => void;
  saveScope: (scope: string, value: Pick<CommitGraphViewState, 'selectedSha' | 'scrollTop'>) => void;
  clearComparison: () => void;
}

const initial: CommitGraphViewState = { scrollTop: 0, filters: DEFAULT_COMMIT_GRAPH_FILTERS };

export const useCommitGraphStore = create<CommitGraphStore>()(persist(set => ({
  view: initial,
  byScope: {},
  patch: value => set(state => ({ view: { ...state.view, ...value } })),
  saveScope: (scope, value) => set(state => {
    const entries = Object.entries({ ...state.byScope, [scope]: value }).slice(-12);
    return { byScope: Object.fromEntries(entries) };
  }),
  clearComparison: () => set(state => ({ view: { ...state.view, compareBaseSha: undefined } })),
}), { name: 'snow-devil-commit-graph', version: 1, partialize: state => ({ view: state.view, byScope: state.byScope }) }));
