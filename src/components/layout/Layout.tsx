import { useLayoutStore } from '../../stores/layout-store';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import './Layout.css';
import { TopBar } from './TopBar';
import { Navigator } from '../navigator/Navigator';
import { Workspace } from '../workspace/Workspace';
import { Inspector } from '../inspector/Inspector';

export function Layout() {
  const { isNavigatorOpen, navigatorWidth, isInspectorOpen, inspectorWidth } = useLayoutStore();
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isBrowserActive = activeTab ? isBrowserTab(activeTab) : false;

  // Hide inspector when a browser tab is active (webview fills the space)
  const showInspector = isInspectorOpen && !isBrowserActive;

  return (
    <div className="layout-root">
      <TopBar />
      <div className="layout-body">
        {isNavigatorOpen && (
          <aside className="layout-navigator glass-panel" style={{ width: navigatorWidth }}>
            <Navigator />
          </aside>
        )}
        
        <main className="layout-workspace">
          <Workspace />
        </main>
        
        {showInspector && (
          <aside className="layout-inspector glass-panel" style={{ width: inspectorWidth }}>
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  );
}
