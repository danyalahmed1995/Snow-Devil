import { useCallback, useEffect, useState } from 'react';
import { cancelAnalyticsSync, coverageFor, getAnalyticsSyncState, isAnalyticsSyncActive, startAnalyticsSync, subscribeAnalyticsSync, type AnalyticsSyncState } from '../analytics/sync';
import { useAnalyticsSettingsStore } from '../stores/analytics-settings-store';
import { useAuthStore } from '../stores/auth-store';
import { useModeStore } from '../stores/mode-store';

export function useAnalyticsSync() {
  const mode = useModeStore(state => state.mode);
  const session = useAuthStore(state => state.session);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const account = mode === 'live' && session.status === 'connected' ? session.account.login : null;
  const [state, setState] = useState<AnalyticsSyncState | null>(null);
  const refresh = useCallback(async () => { if (account) setState(await getAnalyticsSyncState(account)); else setState(null); }, [account]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const unsubscribe = subscribeAnalyticsSync(() => void refresh());
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [refresh]);
  return {
    state,
    coverage: coverageFor(state, settings),
    syncing: account ? isAnalyticsSyncActive(account) || state?.status === 'syncing' : false,
    sync: async () => { if (account) { await startAnalyticsSync(account, settings); await refresh(); } },
    cancel: () => { if (account) cancelAnalyticsSync(account); },
    refresh,
    available: Boolean(account),
  };
}
