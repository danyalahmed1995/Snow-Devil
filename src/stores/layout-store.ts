import { create } from 'zustand';

interface LayoutState {
  navigatorWidth: number;
  inspectorWidth: number;
  isNavigatorOpen: boolean;
  isInspectorOpen: boolean;
  setNavigatorWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  toggleNavigator: () => void;
  toggleInspector: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  navigatorWidth: 280,
  inspectorWidth: 380,
  isNavigatorOpen: true,
  isInspectorOpen: true,
  setNavigatorWidth: (width) => set({ navigatorWidth: Math.max(200, Math.min(width, 600)) }),
  setInspectorWidth: (width) => set({ inspectorWidth: Math.max(200, Math.min(width, 600)) }),
  toggleNavigator: () => set((state) => ({ isNavigatorOpen: !state.isNavigatorOpen })),
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
}));
