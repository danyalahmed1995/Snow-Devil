import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTabsStore, isBrowserTab } from '../stores/tabs-store';
import { useFlowStore } from '../stores/flow-store';
import { browserCreate } from './browser-commands';
import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceTab } from '../browser/browser-tabs';

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

    console.log(`Persistence restored`);
    console.log(`Restored tab count: ${tabs.length}`);
    console.log(`Active tab: ${activeTabId}`);

    const activeTab = tabs.find(t => t.id === activeTabId);
    
    // Remaining tabs sorted by lastActivatedAt descending
    const remainingTabs = tabs.filter(t => t.id !== activeTabId).sort((a, b) => {
      return b.lastActivatedAt - a.lastActivatedAt;
    });

    // Candidates: Active + top 5 remaining
    const eagerCandidates: WorkspaceTab[] = [];
    if (activeTab) eagerCandidates.push(activeTab);
    const needed = Math.max(0, 6 - eagerCandidates.length);
    eagerCandidates.push(...remainingTabs.slice(0, needed));

    const eagerIds = eagerCandidates.map(t => t.id);
    const suspendedIds = tabs.filter(t => !eagerIds.includes(t.id)).map(t => t.id);

    console.log(`Eager queue: ${eagerIds.join(', ')}`);
    if (suspendedIds.length > 0) {
      console.log(`Suspended: ${suspendedIds.join(', ')}`);
    }

    const hydrateTab = async (tab: typeof tabs[0]) => {
      console.log(`Hydration started: ${tab.id} ${tab.kind}`);
      
      if (isBrowserTab(tab)) {
        useTabsStore.getState().updateBrowserTabLifecycle(tab.id, 'hydrating' as any);
        // Force refresh via native browser creation
        try {
          await browserCreate(tab.id, tab.currentUrl, { x: -10000, y: -10000, width: 800, height: 600 });
          useTabsStore.getState().updateBrowserTabLifecycle(tab.id, 'resident');
        } catch (e) {
          console.error("Eager hydration failed for browser tab", tab.id, e);
          useTabsStore.getState().updateBrowserTabLifecycle(tab.id, 'error' as any);
        }
      }

      // Route-specific React Query prefetch
      try {
        const routeKey = [tab.kind];
        
        if (tab.kind === 'home') {
          console.log(`Refresh started: ${tab.id} ${routeKey.join(',')}`);
          await queryClient.prefetchQuery({
            queryKey: ['homeSummary'],
            queryFn: () => invoke('get_account_home_summary')
          });
        } else if (tab.kind === 'flow') {
          const flowState = useFlowStore.getState().getTabState(tab.id);
          const scope = flowState.scope;
          const repo = flowState.selectedRepository;
          const owner = repo?.nameWithOwner.split('/')[0];
          const name = repo?.nameWithOwner.split('/')[1];

          console.log(`Refresh started: ${tab.id} flow ${scope}`);
          
          if (scope === 'repository' && owner && name) {
            queryClient.invalidateQueries({ queryKey: ['infinite_source', 'open_prs', owner, name] });
            await queryClient.prefetchInfiniteQuery({
              queryKey: ['infinite_source', 'open_prs', owner, name],
              queryFn: () => invoke('get_repository_flow', { owner, name, sourceType: 'open_prs', cursor: null, limit: 50 }),
              initialPageParam: null
            });
          } else if (scope === 'account') {
            queryClient.invalidateQueries({ queryKey: ['infinite_source', 'authored_prs'] });
            await queryClient.prefetchInfiniteQuery({
              queryKey: ['infinite_source', 'authored_prs'],
              queryFn: () => invoke('get_account_flow', { sourceType: 'authored_prs', cursor: null, limit: 50 }),
              initialPageParam: null
            });
          }
        }
        
        // Log refresh completion
        const updatedAt = Date.now();
        console.log(`Refresh completed: ${tab.id} ${updatedAt}`);
        console.log(`Hydration ready: ${tab.id}`);

      } catch (e) {
        console.error(`Background refresh failed for ${tab.id}`, e);
      }
    };

    const runHydrationQueue = async () => {
      // Hydrate active tab first immediately
      if (activeTab) {
        await hydrateTab(activeTab);
      }

      // Background candidates
      const backgroundCandidates = eagerCandidates.filter(t => t.id !== activeTabId);
      
      for (let i = 0; i < backgroundCandidates.length; i += 2) {
        const batch = backgroundCandidates.slice(i, i + 2);
        await Promise.all(batch.map(hydrateTab));
      }
    };

    runHydrationQueue();
  }, [tabs, activeTabId, hasHydrated, queryClient]);

  return null;
}
