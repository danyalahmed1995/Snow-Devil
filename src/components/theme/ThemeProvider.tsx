import { useEffect } from 'react';
import { useThemeStore } from '../../stores/theme-store';
import { applyTheme } from '../../theme/theme-registry';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';

export function ThemeProvider() {
  const themeId = useThemeStore(state => state.themeId);
  const reducedMotion = useAnalyticsSettingsStore(state => state.settings.reducedMotion);
  useEffect(() => { applyTheme(themeId); }, [themeId]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false'; }, [reducedMotion]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { document.documentElement.dataset.themeReady = 'true'; });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
