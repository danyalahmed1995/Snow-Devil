import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { pullRequestDetailsQueryKey, pullRequestDetailsQueryRoot, type PullRequestData } from '../../hooks/usePullRequestDetails';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { NativeTab, NativeTabContext } from '../../browser/browser-tabs';
import { useArchitectureRefreshStore } from '../../architecture/refresh-state';
import { fetchPullRequestRiskSnapshot } from '../../simulator/simulator-github-api';
import { saveAnalyticsRiskEventsToDb } from '../../simulator/simulator-cache';
import { useAuthStore } from '../../stores/auth-store';
import { getAnalyticsQueryKey } from '../../hooks/useAnalyticsData';

type PullRequestContext = Extract<NativeTabContext, { type: 'pullRequest' }>;
type PullRequestTab = NativeTab & { context: PullRequestContext };

export function OpenPullRequestRuntime() {
  const tabs = useTabsStore(state => state.tabs);
  const updateNativeTabContext = useTabsStore(state => state.updateNativeTabContext);
  const openPullRequests = useMemo(() => tabs.filter((tab): tab is PullRequestTab =>
    isNativeTab(tab) && tab.kind === 'pullRequestDiff' && tab.context?.type === 'pullRequest'
  ), [tabs]);
  const queryClient = useQueryClient();
  const setRefreshState = useArchitectureRefreshStore(state => state.set);
  const session = useAuthStore(state => state.session);
  const accountLogin = session.status === 'connected' ? session.account.login : undefined;

  useEffect(() => {
    if (openPullRequests.length === 0) return;
    let disposed = false;
    let inFlight = false;
    const settleTimers = new Set<number>();
    const refreshOpenPullRequests = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        await Promise.all(openPullRequests.map(async tab => {
          const [owner, name] = tab.context.repository.split('/');
          try {
            const evidenceRefresh = accountLogin
              ? fetchPullRequestRiskSnapshot(tab.context.repository, tab.context.number)
                  .then(async events => {
                    if (disposed || events.length === 0) return;
                    await saveAnalyticsRiskEventsToDb(accountLogin, events);
                    if (!disposed) await queryClient.invalidateQueries({ queryKey: getAnalyticsQueryKey(accountLogin) });
                  })
                  .catch(() => undefined)
              : Promise.resolve();
            const [latest] = await Promise.all([
              invoke<PullRequestData>('get_pr_details', { owner, name, number: tab.context.number }),
              evidenceRefresh,
            ]);
            const current = useTabsStore.getState().tabs.find(candidate => candidate.id === tab.id);
            if (disposed || !current || !isNativeTab(current) || current.context?.type !== 'pullRequest' || !latest.headRefOid || latest.headRefOid === current.context.headSha) return;
            const isInitialHead = !current.context.headSha;
            queryClient.setQueryData(pullRequestDetailsQueryKey(current.context.repository, current.context.number, latest.headRefOid), latest);
            await queryClient.invalidateQueries({ queryKey: pullRequestDetailsQueryRoot(current.context.repository, current.context.number), refetchType: 'none' });
            if (disposed || !useTabsStore.getState().tabs.some(candidate => candidate.id === tab.id)) return;
            updateNativeTabContext(tab.id, { ...current.context, headSha: latest.headRefOid });
            setRefreshState(tab.id, { status: isInitialHead ? 'current' : 'updated', headSha: latest.headRefOid });
            if (!isInitialHead) {
              const timer = window.setTimeout(() => {
                settleTimers.delete(timer);
                if (!disposed && useTabsStore.getState().tabs.some(candidate => candidate.id === tab.id)) {
                  setRefreshState(tab.id, { status: 'current', headSha: latest.headRefOid });
                }
              }, 4000);
              settleTimers.add(timer);
            }
          } catch {
            // Keep the last verified PR data visible; the next exact open-PR poll retries.
          }
        }));
      } finally {
        inFlight = false;
      }
    };
    void refreshOpenPullRequests();
    const timer = window.setInterval(() => void refreshOpenPullRequests(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      settleTimers.forEach(settleTimer => window.clearTimeout(settleTimer));
      settleTimers.clear();
    };
  }, [accountLogin, openPullRequests, queryClient, setRefreshState, updateNativeTabContext]);

  return null;
}
