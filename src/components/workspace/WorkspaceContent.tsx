/**
 * WorkspaceContent – renders the content area for the active tab.
 *
 * - Native tabs → built-in React views (Home, Map)
 * - Browser tabs → BrowserViewport (webview placeholder)
 */

import { useTabsStore, isNativeTab, isBrowserTab } from '../../stores/tabs-store';
import { Dashboard } from './Dashboard';
import { FlowWorkbench } from './FlowWorkbench';
import { BrowserViewport } from '../../browser/BrowserViewport';
import { browserHideAll } from '../../browser/browser-commands';
import { SimulatorWorkbench } from '../simulator/SimulatorWorkbench';
import { useEffect } from 'react';
import { useModeStore } from '../../stores/mode-store';
import { CIHealthPage } from '../analytics/CIHealthPage';
import { InventoryPage } from '../analytics/InventoryPage';
import { FlowAnalyticsPage } from '../analytics/FlowAnalyticsPage';
import { PersonalFocusPage } from '../analytics/PersonalFocusPage';
import { AnalyticsSettingsPage } from '../analytics/AnalyticsSettingsPage';

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

  // Native tabs
  if (isNativeTab(activeTab)) {
    return (
      <div className="workspace-content">
        {activeTab.kind === 'home' && <Dashboard />}
        {activeTab.kind === 'flow' && <FlowWorkbench />}
        {activeTab.kind === 'ciHealth' && <CIHealthPage />}
        {activeTab.kind === 'inventory' && <InventoryPage />}
        {activeTab.kind === 'flowAnalytics' && <FlowAnalyticsPage />}
        {activeTab.kind === 'personalFocus' && <PersonalFocusPage />}
        {activeTab.kind === 'accountSimulator' && <SimulatorWorkbench key={`account-simulator-${demoRevision}`} mode="account" />}
        {activeTab.kind === 'repositorySimulator' && <SimulatorWorkbench key={`repository-simulator-${demoRevision}`} mode="repository" />}
        {activeTab.kind === 'settings' && <AnalyticsSettingsPage />}
      </div>
    );
  }

  // Browser tabs
  if (isBrowserTab(activeTab)) {
    return (
      <div className="workspace-content">
        <BrowserViewport />
      </div>
    );
  }

  return null;
}
