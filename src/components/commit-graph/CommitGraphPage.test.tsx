import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMMIT_GRAPH_FILTERS } from '../../commit-graph/topology';
import { useCommitGraphStore } from '../../stores/commit-graph-store';
import { useModeStore } from '../../stores/mode-store';
import { useTabsStore } from '../../stores/tabs-store';
import { useHistoryViewStore } from '../../stores/history-view-store';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { CommitGraphPage, patchLineClass } from './CommitGraphPage';

vi.mock('../../data/demo-provider', () => ({ DemoDataProvider: { manifest: async () => ({ schemaVersion: 1, referenceDate: '2026-02-15T00:00:00Z', identity: {}, repositories: [{ id: 'demo-snow-devil', nameWithOwner: 'nova-labs/snow-devil', archived: false, fork: false, stars: 1 }], coverage: [], fixtures: {} }) } }));

const now = Date.now();

function renderGraph() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CommitGraphPage /></QueryClientProvider>);
}

describe('Commit Graph workspace', () => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'demo', demoRevision: 0 });
    useCommitGraphStore.setState({ view: { repository: { id: 'demo-snow-devil', nameWithOwner: 'nova-labs/snow-devil' }, branch: 'main', scrollTop: 0, filters: DEFAULT_COMMIT_GRAPH_FILTERS }, byScope: {} });
    useTabsStore.setState({ tabs: [{ id: 'native:commit-graph', family: 'native', kind: 'commitGraph', title: 'Commit Graph', pinned: false, closable: true, createdAt: now, lastActivatedAt: now }], activeTabId: 'native:commit-graph' });
    useHistoryViewStore.setState({ states: {} });
    useAnalyticsSettingsStore.getState().updateSettings({ businessTimezone: 'Asia/Karachi' });
  });

  it('renders parent-aware history and lazily selected commit context', async () => {
    renderGraph();
    expect(await screen.findByRole('option', { name: /Polish repository architecture context/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(5);
    expect(await screen.findByRole('heading', { name: 'Polish repository architecture context' })).toBeInTheDocument();
    expect(screen.getByText('Verified signature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Pull Request' })).toBeInTheDocument();
    expect(screen.getByText('Topology computed from parent SHAs')).toBeInTheDocument();
    expect(document.querySelector('.commit-diff-line--addition')).toBeInTheDocument();
  });

  it('classifies diff additions, deletions, and hunk headers', () => {
    expect(patchLineClass('+added')).toContain('commit-diff-line--addition');
    expect(patchLineClass('-removed')).toContain('commit-diff-line--deletion');
    expect(patchLineClass('@@ -1 +1 @@')).toContain('commit-diff-line--hunk');
    expect(patchLineClass('+++ b/file')).toBe('commit-diff-line');
  });

  it('opens a persistent read-only comparison after base and target selection', async () => {
    renderGraph();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare From Here' }));
    fireEvent.click(screen.getByRole('option', { name: /Bound inactive query cache entries/ }));
    await waitFor(() => expect(useTabsStore.getState().tabs.some(tab => tab.family === 'native' && tab.kind === 'commitCompare' && tab.context?.type === 'commitCompare')).toBe(true));
  });

  it('opens repository and author history with date-only calendar cursors', async () => {
    renderGraph();
    await screen.findByRole('heading', { name: 'Polish repository architecture context' });

    fireEvent.click(screen.getByRole('button', { name: 'Repository History' }));
    const repositoryHistory = useHistoryViewStore.getState().states['native:repository-simulator'];
    expect(repositoryHistory?.selectedCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(repositoryHistory?.selectedRepository).toEqual({ id: 'demo-snow-devil', nameWithOwner: 'nova-labs/snow-devil' });
    expect(repositoryHistory?.filters.entityType).toBe('all');

    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'maya-snow' }));
    const accountHistory = useHistoryViewStore.getState().states['native:account-simulator'];
    expect(accountHistory?.selectedCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(accountHistory?.filters.entityType).toBe('all');
  });
});
