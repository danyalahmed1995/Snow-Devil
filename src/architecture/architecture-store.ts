import { create } from 'zustand';
import type { ArchitectureSnapshot, PullRequestArchitectureImpact } from './types';

interface ArchitectureTabState { impact?: PullRequestArchitectureImpact; snapshot?: ArchitectureSnapshot; selectedComponentId?: string }
interface ArchitectureStore {
  states: Record<string, ArchitectureTabState>;
  setImpact: (tabId: string, impact?: PullRequestArchitectureImpact) => void;
  setSnapshot: (tabId: string, snapshot?: ArchitectureSnapshot) => void;
  selectComponent: (tabId: string, componentId?: string) => void;
}

export const useArchitectureStore = create<ArchitectureStore>(set => ({
  states: {},
  setImpact: (tabId, impact) => set(state => { const states = { ...state.states }; if (!impact && !states[tabId]?.snapshot) delete states[tabId]; else states[tabId] = { ...states[tabId], impact, selectedComponentId: impact?.primaryComponentId ?? states[tabId]?.selectedComponentId }; return { states }; }),
  setSnapshot: (tabId, snapshot) => set(state => { const states = { ...state.states }; if (!snapshot && !states[tabId]?.impact) delete states[tabId]; else states[tabId] = { ...states[tabId], snapshot, selectedComponentId: states[tabId]?.selectedComponentId ?? snapshot?.components[0]?.id }; return { states }; }),
  selectComponent: (tabId, selectedComponentId) => set(state => ({ states: { ...state.states, [tabId]: { ...state.states[tabId], selectedComponentId } } })),
}));
