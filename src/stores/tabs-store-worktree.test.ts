/**
 * Tests for worktree-related functionality in tabs-store.
 *
 * Covers:
 * - openWorktreeLocalTab produces distinct tab IDs for different worktrees
 * - openWorktreeLocalTab focuses existing tab instead of duplicating
 * - Persisted worktree-local tabs survive normalizeRestoredTabs
 * - v6 → v7 migration does not corrupt existing native or browser tabs
 * - normalizeTab rejects worktreeLocalFile tabs without worktreeLocal context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useTabsStore,
  normalizeRestoredTabs,
} from './tabs-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKTREE_A = '/repos/my-app';
const WORKTREE_B = '/repos/my-app-feat';
const REPO_ROOT = '/repos/my-app';

function makeHome() {
  return {
    id: 'native:home',
    family: 'native',
    kind: 'home',
    title: 'Home',
    closable: false,
    pinned: true,
    createdAt: 1,
    lastActivatedAt: 1,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  // Reset store to a clean state with just the home tab
  useTabsStore.setState({
    tabs: [
      {
        id: 'native:home',
        family: 'native',
        kind: 'home',
        title: 'Home',
        pinned: true,
        closable: false,
        createdAt: 1,
        lastActivatedAt: 1,
      },
    ],
    activeTabId: 'native:home',
    closedTabs: [],
    navigationGeneration: 1,
  });
});

// ---------------------------------------------------------------------------
// openWorktreeLocalTab — distinct tab IDs per worktree
// ---------------------------------------------------------------------------

describe('openWorktreeLocalTab', () => {
  it('produces two distinct tab IDs for two different worktrees with the same file path', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    const filePath = 'src/main.ts';

    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'main.ts · A', filePath);
    openWorktreeLocalTab(WORKTREE_B, REPO_ROOT, 'worktreeLocalFile', 'main.ts · B', filePath);

    const { tabs } = useTabsStore.getState();
    const worktreeTabs = tabs.filter((t) => t.kind === 'worktreeLocalFile');
    expect(worktreeTabs).toHaveLength(2);

    const idA = `worktreeLocal:${WORKTREE_A}:worktreeLocalFile:${filePath}`;
    const idB = `worktreeLocal:${WORKTREE_B}:worktreeLocalFile:${filePath}`;
    expect(tabs.find((t) => t.id === idA)).toBeDefined();
    expect(tabs.find((t) => t.id === idB)).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('produces a single tab when the same worktree + file is opened twice', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    const filePath = 'README.md';

    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'README.md', filePath);
    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'README.md', filePath);

    const { tabs } = useTabsStore.getState();
    const worktreeTabs = tabs.filter((t) => t.kind === 'worktreeLocalFile');
    expect(worktreeTabs).toHaveLength(1);
  });

  it('focuses the existing tab when the same worktree + file is opened twice', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    const filePath = 'README.md';
    const canonicalId = `worktreeLocal:${WORKTREE_A}:worktreeLocalFile:${filePath}`;

    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'README.md', filePath);
    // Navigate away
    useTabsStore.setState({ activeTabId: 'native:home' });
    // Open the same tab again
    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'README.md', filePath);

    expect(useTabsStore.getState().activeTabId).toBe(canonicalId);
  });

  it('sets the canonical ID as the active tab after opening', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalExplorer', 'Explorer', undefined);

    const expectedId = `worktreeLocal:${WORKTREE_A}:worktreeLocalExplorer`;
    expect(useTabsStore.getState().activeTabId).toBe(expectedId);
  });

  it('stores correct worktreeLocal context on the tab', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    const filePath = 'src/app.tsx';
    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeLocalFile', 'app.tsx', filePath);

    const { tabs } = useTabsStore.getState();
    const tab = tabs.find((t) => t.kind === 'worktreeLocalFile');
    expect(tab).toBeDefined();
    expect((tab as any)?.context).toMatchObject({
      type: 'worktreeLocal',
      repositoryRootPath: REPO_ROOT,
      worktreeId: WORKTREE_A,
      subRoute: 'worktreeLocalFile',
      filePath,
    });
  });

  it('opens worktreeChanges tab without a filePath', () => {
    const { openWorktreeLocalTab } = useTabsStore.getState();
    openWorktreeLocalTab(WORKTREE_A, REPO_ROOT, 'worktreeChanges', 'Changes');

    const expectedId = `worktreeLocal:${WORKTREE_A}:worktreeChanges`;
    const { tabs } = useTabsStore.getState();
    expect(tabs.find((t) => t.id === expectedId)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeRestoredTabs — worktree-local tabs survive restoration
// ---------------------------------------------------------------------------

describe('normalizeRestoredTabs — worktree tabs', () => {
  it('preserves a valid worktreeLocalFile tab through normalizeRestoredTabs', () => {
    const worktreeTab = {
      id: `worktreeLocal:${WORKTREE_A}:worktreeLocalFile:src/main.ts`,
      family: 'native',
      kind: 'worktreeLocalFile',
      title: 'main.ts',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: {
        type: 'worktreeLocal',
        repositoryRootPath: REPO_ROOT,
        worktreeId: WORKTREE_A,
        subRoute: 'worktreeLocalFile',
        filePath: 'src/main.ts',
      },
    };

    const tabs = normalizeRestoredTabs([makeHome(), worktreeTab]);
    const restored = tabs.find((t) => t.kind === 'worktreeLocalFile');
    expect(restored).toBeDefined();
    expect(restored?.id).toBe(worktreeTab.id);
    expect((restored as any)?.context).toMatchObject({
      type: 'worktreeLocal',
      worktreeId: WORKTREE_A,
      filePath: 'src/main.ts',
    });
  });

  it('preserves a valid worktreeLocalExplorer tab through normalizeRestoredTabs', () => {
    const explorerTab = {
      id: `worktreeLocal:${WORKTREE_A}:worktreeLocalExplorer`,
      family: 'native',
      kind: 'worktreeLocalExplorer',
      title: 'Explorer',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: {
        type: 'worktreeLocal',
        repositoryRootPath: REPO_ROOT,
        worktreeId: WORKTREE_A,
        subRoute: 'worktreeLocalExplorer',
      },
    };

    const tabs = normalizeRestoredTabs([makeHome(), explorerTab]);
    expect(tabs.find((t) => t.kind === 'worktreeLocalExplorer')).toBeDefined();
  });

  it('preserves a valid worktreeEnvironments tab through normalizeRestoredTabs', () => {
    const envTab = {
      id: 'native:worktree-environments',
      family: 'native',
      kind: 'worktreeEnvironments',
      title: 'Worktrees',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: {
        type: 'worktreeEnvironments',
        repositoryRootPath: REPO_ROOT,
      },
    };

    const tabs = normalizeRestoredTabs([makeHome(), envTab]);
    expect(tabs.find((t) => t.kind === 'worktreeEnvironments')).toBeDefined();
  });

  it('drops a worktreeLocalFile tab that is missing its worktreeLocal context', () => {
    const badTab = {
      id: 'worktreeLocal:some-path:worktreeLocalFile:src/main.ts',
      family: 'native',
      kind: 'worktreeLocalFile',
      title: 'main.ts',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      // context is missing entirely
    };

    const tabs = normalizeRestoredTabs([makeHome(), badTab]);
    expect(tabs.find((t) => t.kind === 'worktreeLocalFile')).toBeUndefined();
  });

  it('drops a worktreeLocalFile tab whose context has wrong type', () => {
    const badTab = {
      id: 'worktreeLocal:some-path:worktreeLocalFile:src/main.ts',
      family: 'native',
      kind: 'worktreeLocalFile',
      title: 'main.ts',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: { type: 'repository', repository: 'owner/repo' },
    };

    const tabs = normalizeRestoredTabs([makeHome(), badTab]);
    expect(tabs.find((t) => t.kind === 'worktreeLocalFile')).toBeUndefined();
  });

  it('drops a worktreeEnvironments tab whose context is missing repositoryRootPath', () => {
    const badTab = {
      id: 'native:worktree-environments',
      family: 'native',
      kind: 'worktreeEnvironments',
      title: 'Worktrees',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: { type: 'worktreeEnvironments' /* missing repositoryRootPath */ },
    };

    const tabs = normalizeRestoredTabs([makeHome(), badTab]);
    expect(tabs.find((t) => t.kind === 'worktreeEnvironments')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// v6 → v7 migration
// ---------------------------------------------------------------------------

describe('tabs-store v6 → v7 migration', () => {
  it('does not corrupt existing native tabs during v6→v7 migration', () => {
    const version6State = {
      state: {
        tabs: [
          makeHome(),
          {
            id: 'native:flow',
            family: 'native',
            kind: 'flow',
            title: 'Flow',
            closable: true,
            pinned: false,
            createdAt: 2,
            lastActivatedAt: 3,
          },
          {
            id: 'ciRun:octo/widgets:99',
            family: 'native',
            kind: 'ciRun',
            title: 'CI · Run #5',
            closable: true,
            pinned: false,
            createdAt: 4,
            lastActivatedAt: 5,
            context: {
              type: 'ciRun',
              repository: 'octo/widgets',
              runId: '99',
              runNumber: 5,
            },
          },
        ],
        activeTabId: 'native:flow',
        navigationGeneration: 1,
        closedTabs: [],
      },
      version: 6,
    };

    localStorage.setItem(
      'github-graph-browser-tabs',
      JSON.stringify(version6State),
    );
    useTabsStore.persist.rehydrate();

    const { tabs, activeTabId } = useTabsStore.getState();

    // Home tab is preserved
    expect(tabs.find((t) => t.id === 'native:home')).toBeDefined();
    // Flow tab is preserved
    expect(tabs.find((t) => t.id === 'native:flow')).toBeDefined();
    // CI run tab is preserved
    const ciTab = tabs.find((t) => t.kind === 'ciRun');
    expect(ciTab).toBeDefined();
    expect(ciTab?.id).toBe('ciRun:octo/widgets:99');
    // Active tab is preserved (flow)
    expect(activeTabId).toBe('native:flow');
  });

  it('does not corrupt browser tabs during v6→v7 migration', () => {
    const version6State = {
      state: {
        tabs: [
          makeHome(),
          {
            id: 'browser:gh-pr-1',
            family: 'browser',
            kind: 'pullRequest',
            title: 'Fix bug',
            currentUrl: 'https://github.com/octo/widgets/pull/1',
            canonicalUrl: 'https://github.com/octo/widgets/pull/1',
            history: ['https://github.com/octo/widgets/pull/1'],
            historyIndex: 0,
            lifecycle: 'resident',
            pinned: false,
            closable: true,
            createdAt: 10,
            lastActivatedAt: 20,
          },
        ],
        activeTabId: 'browser:gh-pr-1',
        navigationGeneration: 2,
        closedTabs: [],
      },
      version: 6,
    };

    localStorage.setItem(
      'github-graph-browser-tabs',
      JSON.stringify(version6State),
    );
    useTabsStore.persist.rehydrate();

    const { tabs } = useTabsStore.getState();
    const browserTab = tabs.find((t) => t.family === 'browser');
    expect(browserTab).toBeDefined();
    expect(browserTab?.title).toBe('Fix bug');
  });

  it('v6→v7 migration is a no-op for already-clean state (does not add home duplicates)', () => {
    const version6State = {
      state: {
        tabs: [makeHome()],
        activeTabId: 'native:home',
        navigationGeneration: 1,
        closedTabs: [],
      },
      version: 6,
    };

    localStorage.setItem(
      'github-graph-browser-tabs',
      JSON.stringify(version6State),
    );
    useTabsStore.persist.rehydrate();

    const { tabs } = useTabsStore.getState();
    expect(tabs.filter((t) => t.id === 'native:home')).toHaveLength(1);
  });

  it('worktree tabs present in v6 storage survive migration to v7', () => {
    // Edge case: someone somehow had worktree tabs at version 6 — they should be kept.
    const worktreeTab = {
      id: `worktreeLocal:${WORKTREE_A}:worktreeLocalExplorer`,
      family: 'native',
      kind: 'worktreeLocalExplorer',
      title: 'Explorer',
      closable: true,
      pinned: false,
      createdAt: 100,
      lastActivatedAt: 200,
      context: {
        type: 'worktreeLocal',
        repositoryRootPath: REPO_ROOT,
        worktreeId: WORKTREE_A,
        subRoute: 'worktreeLocalExplorer',
      },
    };

    const version6State = {
      state: {
        tabs: [makeHome(), worktreeTab],
        activeTabId: worktreeTab.id,
        navigationGeneration: 1,
        closedTabs: [],
      },
      version: 6,
    };

    localStorage.setItem(
      'github-graph-browser-tabs',
      JSON.stringify(version6State),
    );
    useTabsStore.persist.rehydrate();

    const { tabs } = useTabsStore.getState();
    expect(tabs.find((t) => t.kind === 'worktreeLocalExplorer')).toBeDefined();
  });
});
