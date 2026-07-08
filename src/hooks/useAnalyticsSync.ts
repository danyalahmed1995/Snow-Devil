import { useCallback, useEffect, useState } from 'react';
import { cancelAnalyticsSync, coverageFor, getAnalyticsSyncState, isAnalyticsSyncActive, startAnalyticsSync, subscribeAnalyticsSync, syncTargetedRepository, getCIFreshness, isCIRefreshInFlight, type AnalyticsSyncState } from '../analytics/sync';
import { useAnalyticsSettingsStore } from '../stores/analytics-settings-store';
import { useAuthStore } from '../stores/auth-store';
import { useModeStore } from '../stores/mode-store';

const syncStateCache = new Map<string, AnalyticsSyncState | null>();
const syncStateCacheTime = new Map<string, number>();
const syncStateRequests = new Map<string, Promise<AnalyticsSyncState | null>>();
const SYNC_STATE_CACHE_FRESH_MS = 2000;

function readAnalyticsSyncState(account: string, force = false): Promise<AnalyticsSyncState | null> {
  const pending = syncStateRequests.get(account);
  if (pending) return pending;
  if (!force && syncStateCache.has(account) && Date.now() - (syncStateCacheTime.get(account) ?? 0) < SYNC_STATE_CACHE_FRESH_MS) {
    return Promise.resolve(syncStateCache.get(account) ?? null);
  }
  const request = getAnalyticsSyncState(account)
    .then(state => {
      syncStateCache.set(account, state);
      syncStateCacheTime.set(account, Date.now());
      return state;
    })
    .finally(() => syncStateRequests.delete(account));
  syncStateRequests.set(account, request);
  return request;
}

export function clearAnalyticsSyncCacheForTests() {
  syncStateCache.clear();
  syncStateCacheTime.clear();
  syncStateRequests.clear();
}

export function useAnalyticsSync(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const mode = useModeStore(state => state.mode);
  const session = useAuthStore(state => state.session);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const account = mode === 'live' && session.status === 'connected' ? session.account.login : null;
  const [state, setState] = useState<AnalyticsSyncState | null>(() => account ? syncStateCache.get(account) ?? null : null);
  const refresh = useCallback(async (refreshOptions: { force?: boolean } = {}) => { if (account) setState(await readAnalyticsSyncState(account, refreshOptions.force)); else setState(null); }, [account]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      if (account && syncStateCache.has(account)) setState(syncStateCache.get(account) ?? null);
      void refresh();
    }, 0);
    const unsubscribe = subscribeAnalyticsSync(() => void refresh({ force: true }));
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [account, enabled, refresh]);
  const isTargetSyncing = useCallback((repo: string) => account ? isCIRefreshInFlight(repo) : false, [account]);
  const sync = useCallback(async (options?: { priorityRepositories?: string[], singleRepository?: string }) => {
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
    await refresh({ force: true });
  }, [account, refresh, settings]);
  const cancel = useCallback(() => { if (account) cancelAnalyticsSync(account); }, [account]);
  return {
    state,
    coverage: coverageFor(state, settings),
    syncing: account ? isAnalyticsSyncActive(account) || state?.status === 'syncing' : false,
    isTargetSyncing,
    sync,
    getCIFreshness: (repo: string) => getCIFreshness(repo),
    cancel,
    refresh,
    available: Boolean(account),
  };
}



