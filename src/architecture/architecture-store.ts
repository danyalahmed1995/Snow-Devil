import { create } from 'zustand';
import type { ArchitectureColorMode, ArchitectureSnapshot, PullRequestArchitectureImpact } from './types';

export type ArchitectureSection = 'overview' | 'map' | 'files' | 'dependencies' | 'blast' | 'risk';
export type ComponentMapGroupingMode = 'subsystem' | 'rootPath' | 'package' | 'kind' | 'none';

export interface ComponentMapFilters {
  dependencies: boolean;
  dependents: boolean;
  indirect: boolean;
  external: boolean;
}

export interface ComponentMapState {
  colorMode?: ArchitectureColorMode;
  groupingMode: ComponentMapGroupingMode;
  filters: { dependencies: boolean; dependents: boolean; indirect: boolean; external: boolean };
  expandedGroups: string[];
  zoom: number;
  panX: number;
  panY: number;
  isFullScreen?: boolean;
}

export const defaultComponentMapState: ComponentMapState = {
  colorMode: 'architecture',
  groupingMode: 'subsystem',
  filters: { dependencies: true, dependents: true, indirect: true, external: true },
  expandedGroups: [],
  zoom: 1,
  panX: 0,
  panY: 0
};

interface ArchitectureTabState { 
  impact?: PullRequestArchitectureImpact; 
  snapshot?: ArchitectureSnapshot; 
  selectedComponentId?: string;
  selectedEdgeId?: string;
  selectedGroupId?: string;
  section?: ArchitectureSection;
  mapState?: ComponentMapState;
}
interface ArchitectureStore {
  states: Record<string, ArchitectureTabState>;
  setImpact: (tabId: string, impact?: PullRequestArchitectureImpact) => void;
  setSnapshot: (tabId: string, snapshot?: ArchitectureSnapshot) => void;
  selectComponent: (tabId: string, componentId?: string) => void;
  selectEdge: (tabId: string, edgeId?: string) => void;
  selectGroup: (tabId: string, groupId?: string) => void;
  setSection: (tabId: string, section: ArchitectureSection) => void;
  setMapState: (tabId: string, mapState: Partial<ComponentMapState> | ((prev: ComponentMapState) => Partial<ComponentMapState>)) => void;
  clearTab: (tabId: string) => void;
}

export const useArchitectureStore = create<ArchitectureStore>(set => ({
  states: {},
  setImpact: (tabId, impact) => set(state => { const states = { ...state.states }; if (!impact && !states[tabId]?.snapshot) delete states[tabId]; else states[tabId] = { ...states[tabId], impact, selectedComponentId: impact?.primaryComponentId ?? states[tabId]?.selectedComponentId, section: states[tabId]?.section ?? 'overview', mapState: states[tabId]?.mapState ?? defaultComponentMapState }; return { states }; }),
  setSnapshot: (tabId, snapshot) => set(state => { const states = { ...state.states }; if (!snapshot && !states[tabId]?.impact) delete states[tabId]; else states[tabId] = { ...states[tabId], snapshot, selectedComponentId: states[tabId]?.selectedComponentId ?? snapshot?.components[0]?.id }; return { states }; }),
  selectComponent: (tabId, selectedComponentId) => set(state => ({ states: { ...state.states, [tabId]: { ...state.states[tabId], selectedComponentId, selectedEdgeId: undefined, selectedGroupId: undefined } } })),
  selectEdge: (tabId, selectedEdgeId) => set(state => ({ states: { ...state.states, [tabId]: { ...state.states[tabId], selectedEdgeId, selectedComponentId: undefined, selectedGroupId: undefined } } })),
  selectGroup: (tabId, selectedGroupId) => set(state => ({ states: { ...state.states, [tabId]: { ...state.states[tabId], selectedGroupId, selectedComponentId: undefined, selectedEdgeId: undefined } } })),
  setSection: (tabId, section) => set(state => ({ states: { ...state.states, [tabId]: { ...state.states[tabId], section } } })),
  setMapState: (tabId, mapState) => set(state => {
    const currentState = state.states[tabId]?.mapState ?? defaultComponentMapState;
    const partial = typeof mapState === 'function' ? mapState(currentState) : mapState;
    return { states: { ...state.states, [tabId]: { ...state.states[tabId], mapState: { ...currentState, ...partial } } } };
  }),
  clearTab: tabId => set(state => { const states = { ...state.states }; delete states[tabId]; return { states }; }),
}));
