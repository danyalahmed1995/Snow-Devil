import { create } from 'zustand';
import type { AnalyticsInspectable } from '../analytics/types';
import type { SimulatorEntityState, SimulatorEvent } from '../simulator/simulator-types';
import type { FlowItem } from '../types/flow';


export interface TabFlowState {
  scope: 'account' | 'repository';
  mode: 'live' | 'replay';
  selectedRepository?: { id: string; nameWithOwner: string };
  selectedItemId?: string;
  selectedFlowItem?: FlowItem;
  pendingScrollItemId?: string;
  selectedSimulatorEntity?: SimulatorEntityState;
  selectedSimulatorCurrentEntity?: SimulatorEntityState;
  selectedSimulatorEvent?: SimulatorEvent;
  selectedAnalyticsEntity?: AnalyticsInspectable;
  timeRange: '24h' | '7d' | '30d' | 'custom';
  customRangeStart?: string;
  customRangeEnd?: string;
  rangeStart: number;
  rangeEnd: number;
  cursorTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  search: string;
  activeOnly: boolean;
  hideEmptyStages: boolean;
  filterStage?: FlowItem['stage'];
  statusFilter: 'all' | 'attention' | 'waiting_review' | 'failing' | 'merged';
  involvementFilter: 'all' | 'assigned' | 'authored' | 'review_requested' | 'mentioned' | 'participating';
  actorFilter: 'everyone' | 'humans' | 'bots' | 'dependabot' | 'renovate';
  accountRepositoryFilter: string;
  sortOrder: 'newest' | 'oldest' | 'repository' | 'attention';
  sourceContext?: string;
}

const DEFAULT_FLOW_STATE: TabFlowState = {
  scope: 'account',
  mode: 'live',
  timeRange: '7d',
  rangeStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
  rangeEnd: Date.now(),
  cursorTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
  isPlaying: false,
  playbackSpeed: 1,
  search: '',
  activeOnly: false,
  hideEmptyStages: false,
  statusFilter: 'all',
  involvementFilter: 'all',
  actorFilter: 'everyone',
  accountRepositoryFilter: 'all',
  sortOrder: 'newest',
  pendingScrollItemId: undefined,
};

interface FlowStore {
  states: Record<string, TabFlowState>;
  clearTab: (tabId: string) => void;
  setTabState: (tabId: string, state: Partial<TabFlowState>) => void;
  getTabState: (tabId: string) => TabFlowState;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  states: {},
  clearTab: tabId => set(state => {
    if (!state.states[tabId]) return state;
    const states = { ...state.states };
    delete states[tabId];
    return { states };
  }),
  setTabState: (tabId, state) => {
    set((prev) => ({
      states: {
        ...prev.states,
        [tabId]: {
          ...(prev.states[tabId] || DEFAULT_FLOW_STATE),
          ...state,
        },
      },
    }));
  },
  getTabState: (tabId) => {
    return get().states[tabId] || DEFAULT_FLOW_STATE;
  },
}));
