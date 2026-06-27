/**
 * WorkspaceContent – renders the content area for the active tab.
 *
 * - Native tabs → built-in React views (Home, Map)
 * - Browser tabs → BrowserViewport (webview placeholder)
 */

import { useTabsStore, isNativeTab, isBrowserTab } from '../../stores/tabs-store';
import { Dashboard } from './Dashboard';
import { FlowWorkbench } from './FlowWorkbench';
import { TeamworkView } from './TeamworkView';
import { BrowserViewport } from '../../browser/BrowserViewport';
import { browserHideAll } from '../../browser/browser-commands';
import { useEffect } from 'react';

export function WorkspaceContent() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);

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
        {activeTab.kind === 'teamwork' && <TeamworkView />}
        {activeTab.kind === 'settings' && (
          <div style={{ padding: '32px', color: 'var(--text-secondary)' }}>
            Settings (coming soon)
          </div>
        )}
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
