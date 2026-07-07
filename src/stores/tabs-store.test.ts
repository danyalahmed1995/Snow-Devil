import { describe, it, expect, beforeEach } from 'vitest';
import { isNativeTab, normalizeRestoredActiveTabId, normalizeRestoredTabs, useTabsStore } from './tabs-store';

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

  it('sanitizes malformed version 5 restored tabs instead of trusting persisted state', async () => {
    const rawTabs = [
          null,
          { id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: true, pinned: false },
          { id: 'native:bad-repo', family: 'native', kind: 'repositoryExplorer', title: 'Broken repo', context: { type: 'repository', repository: 42 } },
          { id: 'native:flow', family: 'native', kind: 'flow', title: 'Repository Flow', closable: true, pinned: false },
        ];
    const tabs = normalizeRestoredTabs(rawTabs);
    expect(tabs.map(tab => tab.id)).toEqual(['native:home', 'native:flow']);
    expect(normalizeRestoredActiveTabId(rawTabs, 'native:bad-repo', tabs)).toBe('native:home');
    expect(tabs.find(tab => tab.id === 'native:home')).toMatchObject({ pinned: true, closable: false });
  });

  it('canonicalizes and deduplicates restored fixed-page tabs', async () => {
    const rawTabs = [
          { id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 },
          { id: 'legacy-account-history', family: 'native', kind: 'accountSimulator', title: 'Account Simulator', closable: true, pinned: false, createdAt: 2, lastActivatedAt: 2 },
          { id: 'native:account-simulator', family: 'native', kind: 'accountSimulator', title: 'Account History', closable: true, pinned: false, createdAt: 3, lastActivatedAt: 4 },
        ];
    const tabs = normalizeRestoredTabs(rawTabs);
    expect(tabs.filter(tab => tab.kind === 'accountSimulator')).toHaveLength(1);
    expect(tabs.find(tab => tab.kind === 'accountSimulator')).toMatchObject({ id: 'native:account-simulator', title: 'Account History' });
    expect(normalizeRestoredActiveTabId(rawTabs, 'legacy-account-history', tabs)).toBe('native:account-simulator');
  });

  it('activates an existing canonical fixed page without creating a duplicate', () => {
    useTabsStore.setState({ tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home' });
    useTabsStore.getState().openNativeTab('temporary-flow-id', 'flow', 'Flow');
    useTabsStore.getState().openNativeTab('another-flow-id', 'flow', 'Flow');
    const state = useTabsStore.getState();
    expect(state.activeTabId).toBe('native:flow');
    expect(state.tabs.filter(tab => tab.kind === 'flow')).toHaveLength(1);
  });

  it('keeps saved Flow views distinct from the fixed Flow singleton', () => {
    useTabsStore.setState({ tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home' });
    useTabsStore.getState().openNativeTab('native:flow', 'flow', 'Flow');
    useTabsStore.getState().openNativeTab('native:saved-view:one', 'flow', 'Qualification view');
    const state = useTabsStore.getState();
    expect(state.activeTabId).toBe('native:saved-view:one');
    expect(state.tabs.filter(tab => tab.kind === 'flow')).toHaveLength(2);
  });

  it('restores canonical CI run tabs with complete serializable context', () => {
    const rawTabs = [
      { id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 },
      {
        id: 'some-old-ci-id',
        family: 'native',
        kind: 'ciRun',
        title: 'CI · Run #26',
        closable: true,
        pinned: false,
        createdAt: 2,
        lastActivatedAt: 3,
        context: { type: 'ciRun', repository: 'octo/widgets', runId: 123, runNumber: 26, jobId: 456 },
      },
    ];
    const tabs = normalizeRestoredTabs(rawTabs);
    const ciTab = tabs.find(tab => tab.kind === 'ciRun');
    expect(ciTab).toMatchObject({
      id: 'ciRun:octo/widgets:123',
      title: 'CI · Run #26',
      context: { type: 'ciRun', repository: 'octo/widgets', runId: '123', runNumber: 26, selectedJobId: '456', schemaVersion: 1 },
    });
    expect(normalizeRestoredActiveTabId(rawTabs, 'some-old-ci-id', tabs)).toBe('ciRun:octo/widgets:123');
  });

  it('deduplicates CI tabs by canonical repository and run id instead of title', () => {
    const rawTabs = [
      { id: 'ciRun:octo/widgets:123', family: 'native', kind: 'ciRun', title: 'CI #?', closable: true, pinned: false, createdAt: 5, lastActivatedAt: 5, context: { type: 'ciRun', repository: 'octo/widgets', runId: '123' } },
      { id: 'legacy-duplicate', family: 'native', kind: 'ciRun', title: 'Different title', closable: true, pinned: false, createdAt: 6, lastActivatedAt: 9, context: { type: 'ciRun', repository: 'octo/widgets', runId: 123, selectedJobId: 999 } },
    ];
    const tabs = normalizeRestoredTabs(rawTabs);
    expect(tabs.filter(tab => tab.kind === 'ciRun')).toHaveLength(1);
    expect(tabs.find(tab => tab.kind === 'ciRun')).toMatchObject({ id: 'ciRun:octo/widgets:123', title: 'Different title', context: { selectedJobId: '999' } });
  });

  it('keeps incomplete legacy CI tabs recoverable instead of dropping workspace restoration', () => {
    const rawTabs = [
      { id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 },
      { id: 'ciRun:missing-context', family: 'native', kind: 'ciRun', title: 'CI · Run #26', closable: true, pinned: false, createdAt: 2, lastActivatedAt: 2, context: { type: 'ciRun', runId: 26 } },
    ];
    const tabs = normalizeRestoredTabs(rawTabs);
    const ciTab = tabs.find(tab => tab.kind === 'ciRun');
    expect(ciTab).toMatchObject({ id: 'ciRun:missing-context', kind: 'ciRun', title: 'CI · Run #26' });
    expect(ciTab && isNativeTab(ciTab) ? ciTab.context : undefined).toBeUndefined();
  });

  it('persists selected CI job changes back to canonical tab context', () => {
    useTabsStore.setState({ tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', closable: false, pinned: true, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home' });
    useTabsStore.getState().openNativeTab('temporary', 'ciRun', 'CI', false, true, { type: 'ciRun', repository: 'octo/widgets', runId: '123' });
    useTabsStore.getState().updateNativeTabContext('ciRun:octo/widgets:123', { type: 'ciRun', repository: 'octo/widgets', runId: '123', runNumber: 26, selectedJobId: 'job-9', selectedJobName: 'Playwright' });
    const ciTab = useTabsStore.getState().tabs.find(tab => tab.kind === 'ciRun');
    expect(ciTab).toMatchObject({ id: 'ciRun:octo/widgets:123', title: 'CI · Run #26', context: { selectedJobId: 'job-9', selectedJobName: 'Playwright' } });
  });
});
