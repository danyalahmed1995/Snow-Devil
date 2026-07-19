import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTabsStore } from '../stores/tabs-store';
import { useFlowStore } from '../stores/flow-store';
import { invoke } from '@tauri-apps/api/core';

export function BrowserHydrator() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const queryClient = useQueryClient();
  const [hasHydrated, setHasHydrated] = useState(useTabsStore.persist.hasHydrated());
  const startupHydrationStartedRef = useRef(false);

  useEffect(() => {
    const unsub = useTabsStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (startupHydrationStartedRef.current) return;
    if (tabs.length === 0) return;

    // We only want to run this once per startup
    startupHydrationStartedRef.current = true;

    const activeTab = tabs.find(t => t.id === activeTabId);
    
    const hydrateActiveData = async () => {
      if (!activeTab) return;

      // Child WebViews are intentionally not created during startup. Restored
      // browser tabs remain metadata-only until BrowserViewport owns them on
      // explicit activation. This avoids process/GPU contention during the
      // first interactive seconds without losing tab history or identity.
      try {
        if (activeTab.kind === 'home') {
          await queryClient.prefetchQuery({
            queryKey: ['homeSummary'],
            queryFn: () => invoke('get_account_home_summary')
          });
        } else if (activeTab.kind === 'flow') {
          const flowState = useFlowStore.getState().getTabState(activeTab.id);
          const scope = flowState.scope;
          const repo = flowState.selectedRepository;
          const owner = repo?.nameWithOwner.split('/')[0];
          const name = repo?.nameWithOwner.split('/')[1];

          if (scope === 'repository' && owner && name) {
            queryClient.invalidateQueries({ queryKey: ['flow', 'repository'] });
            await queryClient.prefetchInfiniteQuery({
              queryKey: ['flow', 'repository', 'live', `${owner}/${name}`, 'open_prs', {}, flowState.timeRange],
              queryFn: () => invoke('get_source_page', { req: { scope: 'repository', sourceType: 'open_prs', repositoryOwner: owner, repositoryName: name, cursor: null, pageSize: 50 } }),
              initialPageParam: undefined
            });
          } else if (scope === 'account') {
            queryClient.invalidateQueries({ queryKey: ['flow', 'account'] });
            await queryClient.prefetchInfiniteQuery({
              queryKey: ['flow', 'account', 'live', null, 'authored_prs', {}, flowState.timeRange],
              queryFn: () => invoke('get_source_page', { req: { scope: 'account', sourceType: 'authored_prs', cursor: null, pageSize: 50 } }),
              initialPageParam: undefined
            });
          }
        }
        
      } catch {
        // Active data hydration failures are reflected by the owning query state.
      }
    };

    void hydrateActiveData();
  }, [tabs, activeTabId, hasHydrated, queryClient]);

  return null;
}
