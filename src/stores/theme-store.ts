import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID, themeById, type ThemeId } from '../theme/theme-registry';

interface ThemeState { themeId: ThemeId; setTheme: (themeId: ThemeId) => void }

export const useThemeStore = create<ThemeState>()(persist((set) => ({
  themeId: DEFAULT_THEME_ID,
  setTheme: () => set({ themeId: DEFAULT_THEME_ID }),
}), {
  name: 'snow-devil-theme',
  version: 2,
  merge: (persisted, current) => ({ ...current, ...(persisted as Partial<ThemeState>), themeId: themeById((persisted as Partial<ThemeState>)?.themeId).id }),
  partialize: state => ({ themeId: state.themeId }),
}));
