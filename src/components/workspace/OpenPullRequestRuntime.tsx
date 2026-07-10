import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { pullRequestDetailsQueryKey, pullRequestDetailsQueryRoot, type PullRequestData } from '../../hooks/usePullRequestDetails';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { NativeTab, NativeTabContext } from '../../browser/browser-tabs';
import { useArchitectureRefreshStore } from '../../architecture/refresh-state';

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

  useEffect(() => {
    if (openPullRequests.length === 0) return;
    const refreshOpenPullRequests = async () => {
      await Promise.all(openPullRequests.map(async tab => {
        const [owner, name] = tab.context.repository.split('/');
        try {
          const latest = await invoke<PullRequestData>('get_pr_details', { owner, name, number: tab.context.number });
          if (!latest.headRefOid || latest.headRefOid === tab.context.headSha) return;
          const isInitialHead = !tab.context.headSha;
          queryClient.setQueryData(pullRequestDetailsQueryKey(tab.context.repository, tab.context.number, latest.headRefOid), latest);
          await queryClient.invalidateQueries({ queryKey: pullRequestDetailsQueryRoot(tab.context.repository, tab.context.number), refetchType: 'none' });
          updateNativeTabContext(tab.id, { ...tab.context, headSha: latest.headRefOid });
          setRefreshState(tab.id, { status: isInitialHead ? 'current' : 'updated', headSha: latest.headRefOid });
          if (!isInitialHead) window.setTimeout(() => setRefreshState(tab.id, { status: 'current', headSha: latest.headRefOid }), 4000);
        } catch {
          // Keep the last verified PR data visible; the next exact open-PR poll retries.
        }
      }));
    };
    void refreshOpenPullRequests();
    const timer = window.setInterval(() => void refreshOpenPullRequests(), 30_000);
    return () => window.clearInterval(timer);
  }, [openPullRequests, queryClient, setRefreshState, updateNativeTabContext]);

  return null;
}
