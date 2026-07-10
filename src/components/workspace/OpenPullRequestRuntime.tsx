import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { pullRequestDetailsQueryRoot } from '../../hooks/usePullRequestDetails';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { NativeTab, NativeTabContext } from '../../browser/browser-tabs';

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
