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
  useEffect(() => {
    const root = document.documentElement;
    const syncWindowActivity = () => {
      root.dataset.windowActive = document.visibilityState !== 'hidden' && document.hasFocus() ? 'true' : 'false';
    };
    syncWindowActivity();
    document.addEventListener('visibilitychange', syncWindowActivity);
    window.addEventListener('focus', syncWindowActivity);
    window.addEventListener('blur', syncWindowActivity);
    return () => {
      document.removeEventListener('visibilitychange', syncWindowActivity);
      window.removeEventListener('focus', syncWindowActivity);
      window.removeEventListener('blur', syncWindowActivity);
      delete root.dataset.windowActive;
    };
  }, []);
  return null;
}
