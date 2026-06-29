import { useEffect } from 'react';
import { applyTheme, DEFAULT_THEME_ID } from '../../theme/theme-registry';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';

export function ThemeProvider() {
  const reducedMotion = useAnalyticsSettingsStore(state => state.settings.reducedMotion);
  useEffect(() => { applyTheme(DEFAULT_THEME_ID); }, []);
  useEffect(() => { document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false'; }, [reducedMotion]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { document.documentElement.dataset.themeReady = 'true'; });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
