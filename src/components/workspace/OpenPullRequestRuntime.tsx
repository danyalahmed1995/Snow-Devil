import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { pullRequestDetailsQueryRoot } from '../../hooks/usePullRequestDetails';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { NativeTab, NativeTabContext } from '../../browser/browser-tabs';
import { syncTargetedRepository } from '../../analytics/sync';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';

type PullRequestContext = Extract<NativeTabContext, { type: 'pullRequest' }>;
type PullRequestTab = NativeTab & { context: PullRequestContext };

export function OpenPullRequestRuntime() {
  const tabs = useTabsStore(state => state.tabs);
  const updateNativeTabContext = useTabsStore(state => state.updateNativeTabContext);
  const openPullRequests = useMemo(() => tabs.filter((tab): tab is PullRequestTab =>
    isNativeTab(tab) && tab.kind === 'pullRequestDiff' && tab.context?.type === 'pullRequest'
  ), [tabs]);
  const analytics = useAnalyticsData({ enabled: openPullRequests.length > 0 });
  const queryClient = useQueryClient();
  const mode = useModeStore(state => state.mode);
  const session = useAuthStore(state => state.session);
  const account = mode === 'live' && session.status === 'connected' ? session.account.login : undefined;
  const repositories = useMemo(() => [...new Set(openPullRequests.map(tab => tab.context.repository))], [openPullRequests]);

  useEffect(() => {
    if (!account || repositories.length === 0) return;
    const refreshOpenRepositories = () => {
      void Promise.all(repositories.map(repository => syncTargetedRepository(account, repository).catch(() => undefined)));
    };
    refreshOpenRepositories();
    const timer = window.setInterval(refreshOpenRepositories, 30_000);
    return () => window.clearInterval(timer);
  }, [account, repositories]);

  useEffect(() => {
    if (!analytics.data) return;
    for (const tab of openPullRequests) {
      const current = analytics.data.entities.find(entity =>
        entity.type === 'pull_request'
        && entity.repositoryId.toLowerCase() === tab.context.repository.toLowerCase()
        && entity.number === tab.context.number
        && entity.headSha
      );
      if (!current?.headSha || current.headSha === tab.context.headSha) continue;
      void queryClient.invalidateQueries({ queryKey: pullRequestDetailsQueryRoot(tab.context.repository, tab.context.number), refetchType: 'none' });
      updateNativeTabContext(tab.id, { ...tab.context, headSha: current.headSha });
    }
  }, [analytics.data, openPullRequests, queryClient, updateNativeTabContext]);

  return null;
}
