import { create } from 'zustand';

export type ArchitectureRefreshStatus = 'current' | 'syncing' | 'updated';
export interface ArchitectureRefreshValue { status: ArchitectureRefreshStatus; headSha?: string }

interface ArchitectureRefreshStore {
  values: Record<string, ArchitectureRefreshValue | undefined>;
  set: (tabId: string, value: ArchitectureRefreshValue | undefined) => void;
}

export const useArchitectureRefreshStore = create<ArchitectureRefreshStore>((set) => ({
  values: {},
  set: (tabId, value) => set(state => ({ values: { ...state.values, [tabId]: value } })),
}));
