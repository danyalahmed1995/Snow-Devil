import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HistoryFiltersState {
  repository: string;
  involvement: string;
  entityType: string;
  confidence: string;
  actor: string;
  includeBots: boolean;
}

export interface HistoryViewState {
  selectedCalendarDate?: string;
  selectedEntityId?: string;
  selectedEventId?: string;
  selectedRepository?: { id: string; nameWithOwner: string };
  showFilters: boolean;
  showSourceDetails: boolean;
  showAnimation: boolean;
  customRange: boolean;
  filters: HistoryFiltersState;
  activityScrollTop: number;
  sourceScrollTop: number;
}

export function defaultHistoryView(mode: 'account' | 'repository'): HistoryViewState {
  return {
    showFilters: false,
    showSourceDetails: false,
    showAnimation: false,
    customRange: false,
    filters: {
      repository: 'all',
      involvement: 'all',
      entityType: 'all',
      confidence: 'all',
      actor: mode === 'repository' ? 'everyone' : 'humans',
      includeBots: mode === 'repository',
    },
    activityScrollTop: 0,
    sourceScrollTop: 0,
  };
}

const HISTORY_ACTOR_FILTERS = new Set(['humans', 'everyone', 'bots']);

export function normalizeHistoryFilters(filters: HistoryFiltersState, mode: 'account' | 'repository'): HistoryFiltersState {
  if (HISTORY_ACTOR_FILTERS.has(filters.actor)) return filters;
  const defaults = defaultHistoryView(mode).filters;
  return {
    ...filters,
    repository: mode === 'account' ? 'all' : filters.repository,
    actor: defaults.actor,
    includeBots: defaults.includeBots,
  };
}

interface HistoryViewStore {
  states: Record<string, HistoryViewState>;
  patch: (tabId: string, mode: 'account' | 'repository', value: Partial<HistoryViewState>) => void;
  clear: (tabId: string) => void;
}

export const useHistoryViewStore = create<HistoryViewStore>()(persist((set) => ({
  states: {},
  patch: (tabId, mode, value) => set(current => ({
    states: {
      ...current.states,
      [tabId]: { ...(current.states[tabId] ?? defaultHistoryView(mode)), ...value },
    },
  })),
  clear: tabId => set(current => {
    const states = { ...current.states };
    delete states[tabId];
    return { states };
  }),
}), { name: 'snow-devil-history-views', version: 1 }));
