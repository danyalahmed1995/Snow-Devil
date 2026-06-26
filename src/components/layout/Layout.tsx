import { useLayoutStore } from '../../stores/layout-store';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import { BrowserHydrator } from '../../browser/BrowserHydrator';
import './Layout.css';
import { TopBar } from './TopBar';
import { Navigator } from '../navigator/Navigator';
import { Workspace } from '../workspace/Workspace';
import { Inspector } from '../inspector/Inspector';
import { useEffect } from 'react';
import { isNativeTab } from '../../browser/browser-tabs';
import { useFlowStore } from '../../stores/flow-store';

export function Layout() {
  const { isNavigatorOpen, navigatorWidth, isInspectorOpen, inspectorWidth, setInspectorWidth, setInspectorOpen } = useLayoutStore();
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isBrowserActive = activeTab ? isBrowserTab(activeTab) : false;
  const selection = useFlowStore(state => state.getTabState(activeTabId));
  useEffect(() => {
    const hasSelection = Boolean(selection.selectedFlowItem || selection.selectedAnalyticsEntity || selection.selectedSimulatorEntity || selection.selectedSimulatorEvent);
    if (activeTab && isNativeTab(activeTab) && (activeTab.kind === 'settings' || (activeTab.kind === 'accountSimulator' || activeTab.kind === 'repositorySimulator') && !hasSelection)) setInspectorOpen(false);
    else if (hasSelection) setInspectorOpen(true);
  }, [activeTab, selection.selectedAnalyticsEntity, selection.selectedFlowItem, selection.selectedSimulatorEntity, selection.selectedSimulatorEvent, setInspectorOpen]);

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
            <div className="layout-inspector-resizer" role="separator" aria-label="Resize inspector" aria-orientation="vertical" onPointerDown={event => {
              const startX = event.clientX;
              const startWidth = inspectorWidth;
              const move = (moveEvent: PointerEvent) => setInspectorWidth(startWidth + startX - moveEvent.clientX);
              const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }} />
            <Inspector />
          </aside>
        )}
      </div>
      <BrowserHydrator />
    </div>
  );
}
