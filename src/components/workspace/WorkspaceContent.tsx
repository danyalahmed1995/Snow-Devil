/**
 * WorkspaceContent – renders the content area for the active tab.
 *
 * - Native tabs → built-in React views (Home, Map)
 * - Browser tabs → BrowserViewport (webview placeholder)
 */

import { useTabsStore, isNativeTab, isBrowserTab } from '../../stores/tabs-store';
import type { NativeTab } from '../../browser/browser-tabs';
import { Dashboard } from './Dashboard';
import { FlowWorkbench } from './FlowWorkbench';
import { BrowserViewport } from '../../browser/BrowserViewport';
import { browserHideAll } from '../../browser/browser-commands';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useModeStore } from '../../stores/mode-store';
import { ListView } from './ListView';
import { TabInstanceProvider } from './TabInstanceContext';
import { ENABLE_FLOW_ANALYTICS } from '../../config/features';
import { DeferredSurface } from './DeferredSurface';
import { WorkspaceLoadingState } from './WorkspaceLoadingState';
import { acquireFrontendResource } from '../../diagnostics/leak-diagnostics';
import { shouldKeepNativeSurfaceMounted } from './native-surface-lifecycle';

const CIActivityPage = lazy(() => import('../analytics/CIActivityPage').then(module => ({ default: module.CIActivityPage })));
const InventoryPage = lazy(() => import('../analytics/InventoryPage').then(module => ({ default: module.InventoryPage })));
const FlowAnalyticsPage = ENABLE_FLOW_ANALYTICS ? lazy(() => import('../analytics/FlowAnalyticsPage').then(module => ({ default: module.FlowAnalyticsPage }))) : () => null;
const PersonalFocusPage = lazy(() => import('../analytics/PersonalFocusPage').then(module => ({ default: module.PersonalFocusPage })));
const AnalyticsSettingsPage = lazy(() => import('../analytics/AnalyticsSettingsPage').then(module => ({ default: module.AnalyticsSettingsPage })));
const SimulatorWorkbench = lazy(() => import('../simulator/SimulatorWorkbench').then(module => ({ default: module.SimulatorWorkbench })));
const RepositoryExplorer = lazy(() => import('../repository/RepositoryExplorer').then(module => ({ default: module.RepositoryExplorer })));
const PullRequestDiff = lazy(() => import('../diff/PullRequestDiff').then(module => ({ default: module.PullRequestDiff })));
const CommitDiff = lazy(() => import('../diff/CommitDiff').then(module => ({ default: module.CommitDiff })));
const CIRunWatcher = lazy(() => import('./cirun/CIRunWatcher').then(module => ({ default: module.CIRunWatcher })));
const NotificationsPage = lazy(() => import('../notifications/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const EvidenceGraphPage = lazy(() => import('../graph/EvidenceGraphPage').then(module => ({ default: module.EvidenceGraphPage })));
const SketchBoard = lazy(() => import('../sketch/SketchBoard').then(module => ({ default: module.SketchBoard })));

function SurfaceLoading() { return <WorkspaceLoadingState title="Loading workspace surface" detail="Restoring the selected view…" />; }

const LOADING_COPY: Partial<Record<NativeTab['kind'], { title: string; detail: string }>> = {
  inventory: { title: 'Loading Delivery Risks', detail: 'Analyzing repository, pull request, and CI evidence…' },
  ciHealth: { title: 'Loading CI Activity', detail: 'Restoring recent runs and checks…' },
  pullRequestDiff: { title: 'Loading pull request', detail: 'Preparing changes and architecture evidence…' },
  ciRun: { title: 'Loading CI run', detail: 'Restoring recent jobs, checks, and logs…' },
  flow: { title: 'Loading Flow', detail: 'Restoring the current delivery snapshot…' },
  accountSimulator: { title: 'Loading Account History', detail: 'Restoring cached history…' },
  repositorySimulator: { title: 'Loading Repository History', detail: 'Restoring cached history…' },
  repositoryExplorer: { title: 'Loading repository', detail: 'Preparing the repository workspace…' },
  evidenceGraph: { title: 'Loading Architecture Context', detail: 'Preparing the component map…' },
};

function TrackedHeavySurface({ children }: { children: ReactNode }) {
  useEffect(() => acquireFrontendResource('mountedHeavyViews'), []);
  return children;
}

function InvalidCIRunTab({ tab }: { tab: NativeTab }) {
  const closeTab = useTabsStore(state => state.closeTab);
  const openNativeTab = useTabsStore(state => state.openNativeTab);
  return (
    <div className="workspace-loading" role="alert">
      <h2>CI run tab could not be restored</h2>
      <p>This saved tab is missing its repository or workflow run identity.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="analytics-button" onClick={() => useTabsStore.getState().setActiveTab(tab.id)}>Retry</button>
        <button className="analytics-button" onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true)}>Open CI Activity</button>
        <button className="analytics-button" onClick={() => closeTab(tab.id)}>Close Tab</button>
      </div>
    </div>
  );
}

function NativeSurface({ tab, demoRevision }: { tab: NativeTab; demoRevision: number }) {
  const content = <TabInstanceProvider tabId={tab.id}>
    <Suspense fallback={<SurfaceLoading />}>
      {tab.kind === 'home' && <Dashboard />}
      {tab.kind === 'flow' && <FlowWorkbench />}
      {tab.kind === 'ciHealth' && <CIActivityPage />}
      {tab.kind === 'inventory' && <InventoryPage />}
      {ENABLE_FLOW_ANALYTICS && tab.kind === 'flowAnalytics' && <FlowAnalyticsPage />}
      {tab.kind === 'personalFocus' && <PersonalFocusPage />}
      {tab.kind === 'accountSimulator' && <SimulatorWorkbench key={`account-history-${demoRevision}`} mode="account" />}
      {tab.kind === 'repositorySimulator' && <SimulatorWorkbench key={`repository-history-${demoRevision}`} mode="repository" />}
      {tab.kind === 'settings' && <AnalyticsSettingsPage />}
      {tab.kind === 'sketchBoard' && <SketchBoard />}
      {tab.kind === 'repositoryExplorer' && tab.context?.type === 'repository' && <RepositoryExplorer repository={tab.context.repository} initialRef={tab.context.ref} initialPath={tab.context.path} />}
      {tab.kind === 'pullRequestDiff' && tab.context?.type === 'pullRequest' && <PullRequestDiff repository={tab.context.repository} number={tab.context.number} observedHeadSha={tab.context.headSha} />}
      {tab.kind === 'commitDiff' && tab.context?.type === 'commit' && <CommitDiff repository={tab.context.repository} sha={tab.context.sha} />}
      {tab.kind === 'ciRun' && tab.context?.type === 'ciRun' && <CIRunWatcher repositoryId={tab.context.repository} runId={tab.context.runId} initialAttempt={tab.context.attempt} initialJobId={tab.context.selectedJobId ?? tab.context.jobId} />}
      {tab.kind === 'ciRun' && tab.context?.type !== 'ciRun' && <InvalidCIRunTab tab={tab} />}
      {tab.kind === 'notifications' && <NotificationsPage />}
      {tab.kind === 'organizations' && <ListView type="organizations" />}
      {tab.kind === 'evidenceGraph' && <EvidenceGraphPage rootId={tab.context?.type === 'evidenceGraph' ? tab.context.rootId : undefined} />}
    </Suspense>
  </TabInstanceProvider>;
  const loading = LOADING_COPY[tab.kind];
  return loading
    ? <TrackedHeavySurface><DeferredSurface identity={tab.id} title={loading.title} detail={loading.detail}>{content}</DeferredSurface></TrackedHeavySurface>
    : content;
}

export function WorkspaceContent() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const demoRevision = useModeStore(s => s.demoRevision);

  const activeTab = tabs.find(t => t.id === activeTabId);
  // Home is intentionally cheap and remains warm. Every other native surface
  // owns its resources only while active so hidden tabs cannot retain polling,
  // observers, animation frames, workers, or large rendered trees.
  const persistentTabs = tabs.filter((tab): tab is NativeTab => isNativeTab(tab) && shouldKeepNativeSurfaceMounted(tab.kind));
  const activeIsTransientNative = activeTab && isNativeTab(activeTab) && !shouldKeepNativeSurfaceMounted(activeTab.kind);

  // Sync with Tauri backend for native tabs
  useEffect(() => {
    if (activeTab && isNativeTab(activeTab)) {
      browserHideAll().catch(console.error);
    }
  }, [activeTab]);

  if (!activeTab) {
    return (
      <div className="workspace-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>No active tab</p>
      </div>
    );
  }

  return <div className="workspace-content">
    {persistentTabs.map(tab => (
      <div className="workspace-native-surface" key={tab.id} hidden={activeTab.id !== tab.id} aria-hidden={activeTab.id !== tab.id}>
        <NativeSurface tab={tab} demoRevision={demoRevision} />
      </div>
    ))}
    {activeIsTransientNative && <div className="workspace-native-surface" key={activeTab.id}>
      <NativeSurface tab={activeTab} demoRevision={demoRevision} />
    </div>}
    {isBrowserTab(activeTab) && <BrowserViewport />}
  </div>;
}
