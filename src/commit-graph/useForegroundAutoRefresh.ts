import { useEffect, useRef } from 'react';

export const COMMIT_GRAPH_AUTO_REFRESH_MS = 60_000;

/** Runs one refresh at a time and only schedules work while the window is foregrounded. */
export function useForegroundAutoRefresh(enabled: boolean, refresh: () => Promise<unknown>) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number | undefined;
    const clear = () => { window.clearTimeout(timer); timer = undefined; };
    const canRefresh = () => document.visibilityState === 'visible' && document.hasFocus();
    const schedule = () => {
      clear();
      if (disposed || !canRefresh()) return;
      timer = window.setTimeout(async () => {
        timer = undefined;
        if (disposed || !canRefresh()) return;
        try {
          await refreshRef.current();
        } finally {
          schedule();
        }
      }, COMMIT_GRAPH_AUTO_REFRESH_MS);
    };
    const handleActivity = () => schedule();
    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('focus', handleActivity);
    window.addEventListener('blur', handleActivity);
    schedule();
    return () => {
      disposed = true;
      clear();
      document.removeEventListener('visibilitychange', handleActivity);
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('blur', handleActivity);
    };
  }, [enabled]);
}
