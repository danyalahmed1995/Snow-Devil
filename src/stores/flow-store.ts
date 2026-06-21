import { create } from 'zustand';


export interface TabFlowState {
  scope: 'account' | 'repository';
  mode: 'live' | 'replay';
  selectedRepository?: { id: string; nameWithOwner: string };
  selectedItemId?: string;
  selectedSimulatorEntity?: any;
  selectedSimulatorEvent?: any;
  timeRange: '24h' | '7d' | '30d';
  rangeStart: number;
  rangeEnd: number;
  cursorTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
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
};

interface FlowStore {
  states: Record<string, TabFlowState>;
  setTabState: (tabId: string, state: Partial<TabFlowState>) => void;
  getTabState: (tabId: string) => TabFlowState;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  states: {},
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
