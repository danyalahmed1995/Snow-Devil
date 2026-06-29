import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFlowStore } from './flow-store';
import { useTabsStore } from './tabs-store';

export type AppMode = 'live' | 'demo';

interface ModeState {
  mode: AppMode;
  demoRevision: number;
  enterDemo: () => void;
  exitDemo: () => void;
  resetDemo: () => void;
}

function clearSelections() {
  useFlowStore.setState({ states: {} });
}

function returnHome() {
  const now = Date.now();
  useTabsStore.setState({ tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: now, lastActivatedAt: now }], activeTabId: 'native:home', navigationGeneration: useTabsStore.getState().navigationGeneration + 1 });
}

export const useModeStore = create<ModeState>()(persist((set) => ({
  mode: 'live',
  demoRevision: 0,
  enterDemo: () => { clearSelections(); set({ mode: 'demo', demoRevision: 0 }); },
  exitDemo: () => { clearSelections(); returnHome(); set({ mode: 'live', demoRevision: 0 }); },
  resetDemo: () => { clearSelections(); set(state => ({ demoRevision: state.demoRevision + 1 })); },
}), { name: 'snow-devil-mode', partialize: state => ({ mode: state.mode }) }));
