import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
  navigatorWidth: number;
  inspectorWidth: number;
  isNavigatorOpen: boolean;
  isInspectorOpen: boolean;
  setNavigatorWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  toggleNavigator: () => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(persist((set) => ({
  navigatorWidth: 232,
  inspectorWidth: 334,
  isNavigatorOpen: true,
  isInspectorOpen: true,
  setNavigatorWidth: (width) => set({ navigatorWidth: Math.max(216, Math.min(width, 340)) }),
  setInspectorWidth: (width) => set({ inspectorWidth: Math.max(280, Math.min(width, 520)) }),
  toggleNavigator: () => set((state) => ({ isNavigatorOpen: !state.isNavigatorOpen })),
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  setInspectorOpen: (open) => set({ isInspectorOpen: open }),
}), { name: 'snow-devil-layout', version: 2, migrate: (persisted: unknown) => {
  const value = persisted && typeof persisted === 'object' ? persisted as Partial<LayoutState> : {};
  return { ...value, navigatorWidth: Math.max(216, Math.min(value.navigatorWidth ?? 232, 340)), inspectorWidth: Math.max(280, Math.min(value.inspectorWidth ?? 334, 520)) } as LayoutState;
} }));
