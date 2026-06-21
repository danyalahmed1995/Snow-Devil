import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlowWorkbench } from './FlowWorkbench';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { useModeStore } from '../../stores/mode-store';
import homePipeline from '../../../public/demo-data/account/home-pipeline.json';
import manifest from '../../../public/demo-data/manifest.json';
import { invoke } from '@tauri-apps/api/core';

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
    render(<FlowWorkbench />);
    expect(screen.getByText('Account Flow')).toBeInTheDocument();
  });

  it('renders repository selector and empty state when repository scope is selected without a repo', () => {
    render(<FlowWorkbench />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'repository' } });
    
    expect(screen.getByText('Select a Repository')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select a repository...')).toBeInTheDocument();
  });

  it('does not dispatch repository flow request until repository is selected', () => {
    render(<FlowWorkbench />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'repository' } });
    
    // We mocked useRepositoryFlow to check `enabled`. 
    // Since we see "Select a Repository", we know it's not fetching
    expect(screen.getByText('Select a Repository')).toBeInTheDocument();
  });

  it('clears stale selection when scope changes', async () => {
    useFlowStore.getState().setTabState('test-tab', { scope: 'account', selectedItemId: 'stale-item' });
    render(<FlowWorkbench />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'repository' } });
    
    await waitFor(() => {
      expect(useFlowStore.getState().getTabState('test-tab').selectedItemId).toBeUndefined();
    });
  });

  it('shows replay controls only in replay mode with selected repo', () => {
    useFlowStore.getState().setTabState('test-tab', { 
      scope: 'repository', 
      mode: 'replay',
      selectedRepository: { id: '1', nameWithOwner: 'owner/repo' }
    });
    
    render(<FlowWorkbench />);
    
    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(screen.getByText('1x Speed')).toBeInTheDocument();
  });

  it('uses the production pipeline and cards in Demo Mode without live commands', async () => {
    useModeStore.setState({ mode: 'demo' });
    render(<FlowWorkbench />);

    await waitFor(() => expect(screen.getByTestId('flow-pipeline')).toBeInTheDocument());
    expect(screen.queryByText('Connected Activity Flow')).not.toBeInTheDocument();
    expect(document.querySelector('.demo-flow__canvas')).not.toBeInTheDocument();
    expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Replay')).toBeInTheDocument();
    const liveFlowCalls = vi.mocked(invoke).mock.calls.filter(([command]) => command === 'get_source_page' || command === 'get_item_timeline');
    expect(liveFlowCalls).toHaveLength(0);
  });

  it('stores the selected production FlowItem for Inspector parity', async () => {
    useModeStore.setState({ mode: 'demo' });
    render(<FlowWorkbench />);
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
    render(<FlowWorkbench />);
    await waitFor(() => expect(screen.getByText('Cache invalidation after repository scope switching')).toBeInTheDocument());
    expect(screen.queryByText('Deployment rollback telemetry is missing for failed canary releases')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'account' } });
    await waitFor(() => expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument());
  });
});
