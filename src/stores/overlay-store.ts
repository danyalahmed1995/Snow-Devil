import { create } from 'zustand';

interface OverlayState {
  activeOverlayId?: string;
  openOverlay: (id: string) => void;
  closeOverlay: (id: string) => void;
}

export const useOverlayStore = create<OverlayState>(set => ({
  activeOverlayId: undefined,
  openOverlay: id => set({ activeOverlayId: id }),
  closeOverlay: id => set(state => state.activeOverlayId === id ? { activeOverlayId: undefined } : state),
}));
