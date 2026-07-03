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
const NotificationsPage = lazy(() => import('../notifications/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const EvidenceGraphPage = lazy(() => import('../graph/EvidenceGraphPage').then(module => ({ default: module.EvidenceGraphPage })));

function SurfaceLoading() { return <div className="workspace-loading" role="status">Loading workspace surface…</div>; }

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
      {tab.kind === 'notifications' && <NotificationsPage />}
      {tab.kind === 'organizations' && <ListView type="organizations" />}
      {tab.kind === 'evidenceGraph' && <EvidenceGraphPage rootId={tab.context?.type === 'evidenceGraph' ? tab.context.rootId : undefined} />}
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
