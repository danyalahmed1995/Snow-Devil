import { useCallback, useEffect, useState } from 'react';
import { cancelAnalyticsSync, coverageFor, getAnalyticsSyncState, isAnalyticsSyncActive, startAnalyticsSync, subscribeAnalyticsSync, syncTargetedRepository, getCIFreshness, isCIRefreshInFlight, type AnalyticsSyncState } from '../analytics/sync';
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
    isTargetSyncing: (repo: string) => account ? isCIRefreshInFlight(repo) : false,
    sync: async (options?: { priorityRepositories?: string[], singleRepository?: string }) => { 
        if (!account) return;
        if (options?.singleRepository) {
            await syncTargetedRepository(account, options.singleRepository);
        } else if (options?.priorityRepositories && options.priorityRepositories.length > 0) {
            await Promise.all(
                options.priorityRepositories.map(repo => syncTargetedRepository(account, repo).catch(() => {}))
            );
        } else {
            await startAnalyticsSync(account, settings);
        }
        await refresh(); 
    },
    getCIFreshness: (repo: string) => getCIFreshness(repo),
    cancel: () => { if (account) cancelAnalyticsSync(account); },
    refresh,
    available: Boolean(account),
  };
}



