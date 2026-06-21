import { describe, it, expect, beforeEach } from 'vitest';
import { useTabsStore } from './tabs-store';

describe('tabs-store migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates map tab to flow tab from version 3', () => {
    // Set up local storage with version 3 state
    const version3State = {
      state: {
        tabs: [
          { id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true },
          { id: 'native:map', family: 'native', kind: 'map', title: 'Map', closable: true, pinned: false }
        ],
        activeTabId: 'native:map',
        navigationGeneration: 1
      },
      version: 3
    };
    
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify(version3State));
    
    // Force Zustand to rehydrate from localStorage
    useTabsStore.persist.rehydrate();
    
    const state = useTabsStore.getState();
    expect(state.tabs.find(t => t.id === 'native:flow')).toBeDefined();
    expect(state.tabs.find(t => t.id === 'native:map')).toBeUndefined();
    expect(state.activeTabId).toBe('native:flow');
    
    const flowTab = state.tabs.find(t => t.id === 'native:flow');
    expect(flowTab?.kind).toBe('flow');
    expect(flowTab?.title).toBe('Flow');
  });
});
