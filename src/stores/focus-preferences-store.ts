import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FocusPreferencesState {
  dismissed: string[];
  irrelevant: string[];
  snoozedUntil: Record<string, number>;
  dismiss: (id: string) => void;
  markIrrelevant: (id: string) => void;
  snooze: (id: string, until?: number) => void;
  undo: (id: string) => void;
}

export const useFocusPreferencesStore = create<FocusPreferencesState>()(persist(set => ({
  dismissed: [],
  irrelevant: [],
  snoozedUntil: {},
  dismiss: id => set(state => ({ dismissed: [...new Set([...state.dismissed, id])] })),
  markIrrelevant: id => set(state => ({ irrelevant: [...new Set([...state.irrelevant, id])] })),
  snooze: (id, until = Date.now() + 24 * 60 * 60 * 1000) => set(state => ({ snoozedUntil: { ...state.snoozedUntil, [id]: until } })),
  undo: id => set(state => ({ dismissed: state.dismissed.filter(value => value !== id), irrelevant: state.irrelevant.filter(value => value !== id), snoozedUntil: Object.fromEntries(Object.entries(state.snoozedUntil).filter(([key]) => key !== id)) })),
}), { name: 'snow-devil-focus-preferences', version: 1 }));

