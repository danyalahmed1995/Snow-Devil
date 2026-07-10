/**
 * WorkspaceContent – renders the content area for the active tab.
 *
 * - Native tabs → built-in React views (Home, Map)
 * - Browser tabs → BrowserViewport (webview placeholder)
 */

import { useTabsStore, isNativeTab, isBrowserTab, isFixedNativeTab } from '../../stores/tabs-store';
import type { NativeTab } from '../../browser/browser-tabs';
import { Dashboard } from './Dashboard';
import { FlowWorkbench } from './FlowWorkbench';
import { BrowserViewport } from '../../browser/BrowserViewport';
import { browserHideAll } from '../../browser/browser-commands';
import { lazy, Suspense, useEffect } from 'react';
import { useModeStore } from '../../stores/mode-store';
import { ListView } from './ListView';
import { TabInstanceProvider } from './TabInstanceContext';

const CIActivityPage = lazy(() => import('../analytics/CIActivityPage').then(module => ({ default: module.CIActivityPage })));
const InventoryPage = lazy(() => import('../analytics/InventoryPage').then(module => ({ default: module.InventoryPage })));
const FlowAnalyticsPage = lazy(() => import('../analytics/FlowAnalyticsPage').then(module => ({ default: module.FlowAnalyticsPage })));
const PersonalFocusPage = lazy(() => import('../analytics/PersonalFocusPage').then(module => ({ default: module.PersonalFocusPage })));
const AnalyticsSettingsPage = lazy(() => import('../analytics/AnalyticsSettingsPage').then(module => ({ default: module.AnalyticsSettingsPage })));
const SimulatorWorkbench = lazy(() => import('../simulator/SimulatorWorkbench').then(module => ({ default: module.SimulatorWorkbench })));
const RepositoryExplorer = lazy(() => import('../repository/RepositoryExplorer').then(module => ({ default: module.RepositoryExplorer })));
const PullRequestDiff = lazy(() => import('../diff/PullRequestDiff').then(module => ({ default: module.PullRequestDiff })));
const CommitDiff = lazy(() => import('../diff/CommitDiff').then(module => ({ default: module.CommitDiff })));
const CIRunWatcher = lazy(() => import('./cirun/CIRunWatcher').then(module => ({ default: module.CIRunWatcher })));
const NotificationsPage = lazy(() => import('../notifications/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const EvidenceGraphPage = lazy(() => import('../graph/EvidenceGraphPage').then(module => ({ default: module.EvidenceGraphPage })));
const WorktreeEnvironmentsPage = lazy(() => import('../worktrees/WorktreeEnvironmentsPage').then(module => ({ default: module.WorktreeEnvironmentsPage })));
const WorktreeLocalExplorer = lazy(() => import('../worktrees/WorktreeLocalExplorer').then(module => ({ default: module.WorktreeLocalExplorer })));
const WorktreeLocalFilePage = lazy(() => import('../worktrees/WorktreeLocalFilePage').then(module => ({ default: module.WorktreeLocalFilePage })));
const WorktreeChangesPanel = lazy(() => import('../worktrees/WorktreeChangesPanel').then(module => ({ default: module.WorktreeChangesPanel })));

function SurfaceLoading() { return <div className="workspace-loading" role="status">Loading workspace surface…</div>; }

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
  return <TabInstanceProvider tabId={tab.id}>
    <Suspense fallback={<SurfaceLoading />}>
      {tab.kind === 'home' && <Dashboard />}
      {tab.kind === 'flow' && <FlowWorkbench />}
      {tab.kind === 'ciHealth' && <CIActivityPage />}
      {tab.kind === 'inventory' && <InventoryPage />}
      {tab.kind === 'flowAnalytics' && <FlowAnalyticsPage />}
      {tab.kind === 'personalFocus' && <PersonalFocusPage />}
      {tab.kind === 'accountSimulator' && <SimulatorWorkbench key={`account-history-${demoRevision}`} mode="account" />}
      {tab.kind === 'repositorySimulator' && <SimulatorWorkbench key={`repository-history-${demoRevision}`} mode="repository" />}
      {tab.kind === 'settings' && <AnalyticsSettingsPage />}
      {tab.kind === 'repositoryExplorer' && tab.context?.type === 'repository' && <RepositoryExplorer repository={tab.context.repository} initialRef={tab.context.ref} initialPath={tab.context.path} />}
      {tab.kind === 'pullRequestDiff' && tab.context?.type === 'pullRequest' && <PullRequestDiff repository={tab.context.repository} number={tab.context.number} />}
      {tab.kind === 'commitDiff' && tab.context?.type === 'commit' && <CommitDiff repository={tab.context.repository} sha={tab.context.sha} />}
      {tab.kind === 'ciRun' && tab.context?.type === 'ciRun' && <CIRunWatcher repositoryId={tab.context.repository} runId={tab.context.runId} initialAttempt={tab.context.attempt} initialJobId={tab.context.selectedJobId ?? tab.context.jobId} />}
      {tab.kind === 'ciRun' && tab.context?.type !== 'ciRun' && <InvalidCIRunTab tab={tab} />}
      {tab.kind === 'notifications' && <NotificationsPage />}
      {tab.kind === 'organizations' && <ListView type="organizations" />}
      {tab.kind === 'evidenceGraph' && <EvidenceGraphPage rootId={tab.context?.type === 'evidenceGraph' ? tab.context.rootId : undefined} />}
      {tab.kind === 'worktreeEnvironments' && <WorktreeEnvironmentsPage />}
      {tab.kind === 'worktreeLocalExplorer' && tab.context?.type === 'worktreeLocal' && (
        <WorktreeLocalExplorer worktreeId={tab.context.worktreeId} repositoryRootPath={tab.context.repositoryRootPath} />
      )}
      {tab.kind === 'worktreeLocalFile' && tab.context?.type === 'worktreeLocal' && tab.context.filePath && (
        <WorktreeLocalFilePage worktreeId={tab.context.worktreeId} filePath={tab.context.filePath} repositoryRootPath={tab.context.repositoryRootPath} />
      )}
      {tab.kind === 'worktreeChanges' && tab.context?.type === 'worktreeLocal' && (
        <WorktreeChangesPanel worktreeId={tab.context.worktreeId} repositoryRootPath={tab.context.repositoryRootPath} />
      )}
    </Suspense>
  </TabInstanceProvider>;
}

export function WorkspaceContent() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const demoRevision = useModeStore(s => s.demoRevision);

  const activeTab = tabs.find(t => t.id === activeTabId);

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

  const fixedTabs = tabs.filter((tab): tab is NativeTab => isNativeTab(tab) && isFixedNativeTab(tab));
  const dynamicNative = isNativeTab(activeTab) && !isFixedNativeTab(activeTab) ? activeTab : undefined;
  return <div className="workspace-content">
    {fixedTabs.map(tab => <div className="workspace-native-surface" key={tab.id} hidden={activeTabId !== tab.id} aria-hidden={activeTabId !== tab.id}><NativeSurface tab={tab} demoRevision={demoRevision} /></div>)}
    {dynamicNative && <div className="workspace-native-surface"><NativeSurface tab={dynamicNative} demoRevision={demoRevision} /></div>}
    {isBrowserTab(activeTab) && <BrowserViewport />}
  </div>;
}
