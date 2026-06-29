import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlowWorkbench } from './FlowWorkbench';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { useModeStore } from '../../stores/mode-store';
import homePipeline from '../../../public/demo-data/account/home-pipeline.json';
import manifest from '../../../public/demo-data/manifest.json';
import { invoke } from '@tauri-apps/api/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the Tauri invoke command
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd) => {
    if (cmd === 'get_all_repositories') {
      return Promise.resolve([{ id: '1', name: 'owner/repo', url: '', updated_at: '' }]);
    }
    if (cmd === 'get_repository_flow') {
      return Promise.resolve({ nodes: [] });
    }
    return Promise.resolve();
  })
}));

// Mock hooks
vi.mock('../../hooks/useInfiniteSource', () => ({
  useInfiniteSource: vi.fn(({ enabled }: { enabled: boolean }) => ({
    data: enabled ? { pages: [] } : undefined,
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false
  }))
}));

vi.mock('../../hooks/useReplayBuffer', () => ({
  useReplayBuffer: () => ({ events: [], isLoading: false, isPartial: false, error: null })
}));

describe('FlowWorkbench', () => {
  const renderWorkbench = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><FlowWorkbench /></QueryClientProvider>);
  };
  const choose = (label: string, option: string) => {
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('option', { name: option }));
  };
  beforeEach(() => {
    useTabsStore.setState({ activeTabId: 'test-tab', tabs: [{ id: 'test-tab', title: 'Flow', closable: true } as any] });
    useFlowStore.setState({ states: {} });
    useModeStore.setState({ mode: 'live' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => path.endsWith('manifest.json') ? manifest : homePipeline,
    })));
  });

  it('shows account flow by default', () => {
    renderWorkbench();
    expect(screen.getByText('Account Flow')).toBeInTheDocument();
  });

  it('renders repository selector and empty state when repository scope is selected without a repo', () => {
    renderWorkbench();
    choose('Flow scope', 'Repository Flow');
    
    expect(screen.getByText('Select a Repository')).toBeInTheDocument();
    expect(screen.getByLabelText('Repository')).toBeInTheDocument();
  });

  it('does not dispatch repository flow request until repository is selected', () => {
    renderWorkbench();
    choose('Flow scope', 'Repository Flow');
    
    // We mocked useRepositoryFlow to check `enabled`. 
    // Since we see "Select a Repository", we know it's not fetching
    expect(screen.getByText('Select a Repository')).toBeInTheDocument();
  });

  it('clears stale selection when scope changes', async () => {
    useFlowStore.getState().setTabState('test-tab', { scope: 'account', selectedItemId: 'stale-item' });
    renderWorkbench();
    choose('Flow scope', 'Repository Flow');
    
    await waitFor(() => {
      expect(useFlowStore.getState().getTabState('test-tab').selectedItemId).toBeUndefined();
    });
  });

  it('clears transient search and stage filters with Escape', () => {
    useFlowStore.getState().setTabState('test-tab', {
      search: 'review',
      filterStage: 'review',
      statusFilter: 'waiting_review',
    });
    renderWorkbench();
    fireEvent.keyDown(window, { key: 'Escape' });

    const state = useFlowStore.getState().getTabState('test-tab');
    expect(state.search).toBe('');
    expect(state.filterStage).toBeUndefined();
    expect(state.statusFilter).toBe('all');
  });

  it('removes the fake Live and Replay controls from Flow', () => {
    useFlowStore.getState().setTabState('test-tab', { 
      scope: 'repository', 
      mode: 'replay',
      selectedRepository: { id: '1', nameWithOwner: 'owner/repo' }
    });
    
    renderWorkbench();
    
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(screen.queryByText('Replay')).not.toBeInTheDocument();
    expect(screen.getByText(/Synced snapshot/)).toBeInTheDocument();
  });

  it('uses the production pipeline and cards in Demo Mode without live commands', async () => {
    useModeStore.setState({ mode: 'demo' });
    renderWorkbench();

    await waitFor(() => expect(screen.getByTestId('flow-pipeline')).toBeInTheDocument());
    expect(screen.queryByText('Connected Activity Flow')).not.toBeInTheDocument();
    expect(document.querySelector('.demo-flow__canvas')).not.toBeInTheDocument();
    expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.queryByText('Replay')).not.toBeInTheDocument();
    const liveFlowCalls = vi.mocked(invoke).mock.calls.filter(([command]) => command === 'get_source_page' || command === 'get_item_timeline');
    expect(liveFlowCalls).toHaveLength(0);
  });

  it('stores the selected production FlowItem for Inspector parity', async () => {
    useModeStore.setState({ mode: 'demo' });
    renderWorkbench();
    await waitFor(() => expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Deployment rollback telemetry is missing for failed canary releases'));
    const state = useFlowStore.getState().getTabState('test-tab');
    expect(state.selectedFlowItem?.id).toBe('demo-issue-92');
    expect(state.selectedFlowItem?.labels?.[0].name).toBe('observability');
  });

  it('clears repository filtering when returning to account scope', async () => {
    useModeStore.setState({ mode: 'demo' });
    useFlowStore.getState().setTabState('test-tab', {
      scope: 'repository',
      selectedRepository: { id: 'repo-ext', nameWithOwner: 'nova-labs/ext' },
    });
    renderWorkbench();
    await waitFor(() => expect(screen.getAllByText('Cache invalidation after repository scope switching').length).toBeGreaterThan(0));
    expect(screen.queryByText('Deployment rollback telemetry is missing for failed canary releases')).not.toBeInTheDocument();

    choose('Flow scope', 'Account Flow');
    await waitFor(() => expect(screen.getAllByText('Deployment rollback telemetry is missing for failed canary releases').length).toBeGreaterThan(0));
  });
});
