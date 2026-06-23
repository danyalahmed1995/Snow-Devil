import { useEffect } from 'react';
import { useThemeStore } from '../../stores/theme-store';
import { applyTheme } from '../../theme/theme-registry';

export function ThemeProvider() {
  const themeId = useThemeStore(state => state.themeId);
  useEffect(() => { applyTheme(themeId); }, [themeId]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { document.documentElement.dataset.themeReady = 'true'; });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
