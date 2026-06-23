/**
 * WorkspaceTabStrip – renders tabs with proper single-line truncation,
 * close buttons, and horizontal scroll overflow.
 */

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import type { WorkspaceTab } from '../../stores/tabs-store';

export function WorkspaceTabStrip() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const setActiveTab = useTabsStore(s => s.setActiveTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const tab = tabRefs.current.get(activeTabId);
    if (!tab) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeTabId, tabs.length]);

  return (
    <div className="workspace-tab-strip glass-panel" role="tablist">
      {tabs.map((tab: WorkspaceTab) => {
        const isActive = tab.id === activeTabId;
        const isBrowser = isBrowserTab(tab);
        const tooltip = isBrowser ? `${tab.title}\n${tab.currentUrl}` : tab.title;

        return (
          <div
            key={tab.id}
            ref={element => {
              if (element) tabRefs.current.set(tab.id, element);
              else tabRefs.current.delete(tab.id);
            }}
            className={`workspace-tab ${isActive ? 'workspace-tab--active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.title}
            title={tooltip}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={event => { if (event.button === 1 && tab.closable) { event.preventDefault(); closeTab(tab.id); } }}
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
                <X size={15} strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
