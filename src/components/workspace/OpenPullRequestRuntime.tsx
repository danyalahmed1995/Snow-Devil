import { useEffect, useMemo, useRef } from 'react';
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
  const settleTimersRef = useRef(new Map<string, number>());

  useEffect(() => () => {
    settleTimersRef.current.forEach(timer => window.clearTimeout(timer));
    settleTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const openTabIds = new Set(openPullRequests.map(tab => tab.id));
    settleTimersRef.current.forEach((timer, tabId) => {
      if (openTabIds.has(tabId)) return;
      window.clearTimeout(timer);
      settleTimersRef.current.delete(tabId);
    });
  }, [openPullRequests]);

  useEffect(() => {
    if (openPullRequests.length === 0) return;
    let disposed = false;
    let inFlight = false;
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
            const existingSettleTimer = settleTimersRef.current.get(tab.id);
            if (existingSettleTimer !== undefined) window.clearTimeout(existingSettleTimer);
            setRefreshState(tab.id, { status: isInitialHead ? 'current' : 'updated', headSha: latest.headRefOid });
            if (!isInitialHead) {
              const timer = window.setTimeout(() => {
                if (settleTimersRef.current.get(tab.id) !== timer) return;
                settleTimersRef.current.delete(tab.id);
                const latestTab = useTabsStore.getState().tabs.find(candidate => candidate.id === tab.id);
                if (latestTab && isNativeTab(latestTab) && latestTab.context?.type === 'pullRequest' && latestTab.context.headSha === latest.headRefOid) setRefreshState(tab.id, { status: 'current', headSha: latest.headRefOid });
              }, 4000);
              settleTimersRef.current.set(tab.id, timer);
            } else settleTimersRef.current.delete(tab.id);
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
    };
  }, [accountLogin, openPullRequests, queryClient, setRefreshState, updateNativeTabContext]);

  return null;
}
