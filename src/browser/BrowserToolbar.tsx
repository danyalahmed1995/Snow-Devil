/**
 * BrowserToolbar – Back / Forward / Reload controls for browser tabs.
 */

import { useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import { browserBack, browserForward, browserReload, browserStop } from './browser-commands';
import { useTabsStore } from '../stores/tabs-store';
import type { BrowserTab } from './browser-tabs';

interface BrowserToolbarProps {
  /** The active browser tab, or undefined if a native tab is active. */
  activeTab?: BrowserTab;
}

export function BrowserToolbar({ activeTab }: BrowserToolbarProps) {
  const disabled = !activeTab;
  const canGoBack = activeTab && activeTab.historyIndex > 0;
  const canGoForward = activeTab && activeTab.historyIndex < activeTab.history.length - 1;

  const handleBack = useCallback(() => {
    if (!activeTab) return;
    const store = useTabsStore.getState();
    const newGen = store.browserNavigateBack();
    if (newGen !== undefined) browserBack(activeTab.id).catch(console.error);
  }, [activeTab]);

  const handleForward = useCallback(() => {
    if (!activeTab) return;
    const store = useTabsStore.getState();
    const newGen = store.browserNavigateForward();
    if (newGen !== undefined) browserForward(activeTab.id).catch(console.error);
  }, [activeTab]);

  const handleReload = useCallback(() => {
    if (activeTab) browserReload(activeTab.id).catch(console.error);
  }, [activeTab]);
  const handleStop = useCallback(() => { if (activeTab) browserStop(activeTab.id).catch(console.error); }, [activeTab]);

  return (
    <div className="browser-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        className="icon-button"
        disabled={!canGoBack}
        onClick={handleBack}
        title="Back"
        aria-label="Go back"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        className="icon-button"
        disabled={!canGoForward}
        onClick={handleForward}
        title="Forward"
        aria-label="Go forward"
      >
        <ArrowRight size={16} />
      </button>
      <button
        className="icon-button"
        disabled={disabled}
        onClick={activeTab?.isLoading ? handleStop : handleReload}
        title={activeTab?.isLoading ? 'Stop loading' : 'Reload'}
        aria-label={activeTab?.isLoading ? 'Stop loading' : 'Reload page'}
      >
        {activeTab?.isLoading ? <X size={16}/> : <RotateCw size={16} />}
      </button>
      {activeTab?.error && <span className="browser-toolbar__error" role="alert" title={activeTab.error}>{activeTab.error}</span>}
    </div>
  );
}
