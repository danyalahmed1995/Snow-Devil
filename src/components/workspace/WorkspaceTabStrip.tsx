/**
 * WorkspaceTabStrip – renders tabs with proper single-line truncation,
 * close buttons, and horizontal scroll overflow.
 */

import { X } from 'lucide-react';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import type { WorkspaceTab } from '../../stores/tabs-store';

export function WorkspaceTabStrip() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const setActiveTab = useTabsStore(s => s.setActiveTab);
  const closeTab = useTabsStore(s => s.closeTab);

  return (
    <div className="workspace-tab-strip glass-panel" role="tablist">
      {tabs.map((tab: WorkspaceTab) => {
        const isActive = tab.id === activeTabId;
        const isBrowser = isBrowserTab(tab);
        const tooltip = isBrowser ? `${tab.title}\n${tab.currentUrl}` : tab.title;

        return (
          <div
            key={tab.id}
            className={`workspace-tab ${isActive ? 'workspace-tab--active' : ''}`}
            role="tab"
            aria-selected={isActive}
            title={tooltip}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="workspace-tab__title">{tab.title}</span>
            {tab.closable && (
              <button
                className="workspace-tab__close"
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
