export type FrontendResourceKind =
  | 'eventListeners' | 'timers' | 'intervals' | 'animationFrames'
  | 'resizeObservers' | 'mutationObservers' | 'intersectionObservers'
  | 'workers' | 'zustandSubscriptions' | 'queryObservers' | 'objectUrls'
  | 'graphInstances' | 'mountedHeavyViews' | 'tauriListeners';

const enabled = import.meta.env.DEV || import.meta.env.VITE_LEAK_DIAGNOSTICS === 'true';
const counters: Record<FrontendResourceKind, number> = {
  eventListeners: 0, timers: 0, intervals: 0, animationFrames: 0,
  resizeObservers: 0, mutationObservers: 0, intersectionObservers: 0,
  workers: 0, zustandSubscriptions: 0, queryObservers: 0, objectUrls: 0,
  graphInstances: 0, mountedHeavyViews: 0, tauriListeners: 0,
};

export function acquireFrontendResource(kind: FrontendResourceKind): () => void {
  if (!enabled) return () => undefined;
  counters[kind] += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    counters[kind] = Math.max(0, counters[kind] - 1);
  };
}

export function getFrontendLeakDiagnostics() {
  const { tabs, activeTabId } = useTabsStore.getState();
  const queries = queryClient.getQueryCache().getAll();
  const architectureStates = useArchitectureStore.getState().states;
  const persistedKeys = ['github-graph-browser-tabs', 'snow-devil-history-views', 'snow-devil-analytics-settings'];
  return {
    enabled,
    frontend: {
      eventListeners: null, timers: null, intervals: null, animationFrames: null,
      resizeObservers: null, mutationObservers: null, intersectionObservers: null,
      workers: counters.workers,
      zustandSubscriptions: null,
      queryObservers: queries.reduce((total, query) => total + query.getObserversCount(), 0),
      objectUrls: null, graphInstances: null,
      mountedHeavyViews: counters.mountedHeavyViews,
      tauriListeners: null,
    },
    tabs: {
      total: tabs.length, active: activeTabId,
      suspended: tabs.filter(tab => isBrowserTab(tab) && tab.lifecycle === 'suspended').length,
      disposed: useTabsStore.getState().closedTabs.length,
      browserTabs: tabs.filter(isBrowserTab).length,
      prTabs: tabs.filter(tab => isNativeTab(tab) && tab.kind === 'pullRequestDiff').length,
      ciTabs: tabs.filter(tab => isNativeTab(tab) && (tab.kind === 'ciRun' || tab.kind === 'ciHealth')).length,
      architectureTabs: tabs.filter(tab => isNativeTab(tab) && (tab.kind === 'evidenceGraph' || tab.kind === 'pullRequestDiff')).length,
      deliveryRiskTabs: tabs.filter(tab => isNativeTab(tab) && tab.kind === 'inventory').length,
    },
    caches: {
      queryEntries: queries.length,
      architectureTabEntries: Object.keys(architectureStates).length,
      architectureNodes: Object.values(architectureStates).reduce((total, state) => total + (state.snapshot?.components.length ?? 0), 0),
      architectureEdges: Object.values(architectureStates).reduce((total, state) => total + (state.snapshot?.dependencies.length ?? 0), 0),
      flowTabEntries: Object.keys(useFlowStore.getState().states).length,
      historyTabEntries: Object.keys(useHistoryViewStore.getState().states).length,
      persistedStateBytes: Object.fromEntries(persistedKeys.map(key => [key, localStorage.getItem(key)?.length ?? 0])),
    },
  };
}

export function installLeakDiagnostics() {
  if (!enabled) return;
  Object.defineProperty(window, '__SNOW_DEVIL_LEAK_DIAGNOSTICS__', {
    configurable: true,
    value: getFrontendLeakDiagnostics,
  });
}

declare global {
  interface Window { __SNOW_DEVIL_LEAK_DIAGNOSTICS__?: typeof getFrontendLeakDiagnostics }
}
import { queryClient } from '../app/providers';
import { useArchitectureStore } from '../architecture/architecture-store';
import { isBrowserTab, isNativeTab } from '../browser/browser-tabs';
import { useFlowStore } from '../stores/flow-store';
import { useHistoryViewStore } from '../stores/history-view-store';
import { useTabsStore } from '../stores/tabs-store';
