import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { useModeStore } from '../../stores/mode-store';
import { useAuthStore } from '../../stores/auth-store';
import { invoke } from '@tauri-apps/api/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import homePipeline from '../../../public/demo-data/account/home-pipeline.json';
import homeData from '../../../public/demo-data/account/home.json';
import manifest from '../../../public/demo-data/manifest.json';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const queryClient = new QueryClient();

function renderDashboard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

describe('Dashboard (Home)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    useFlowStore.setState({ states: {} });
    useTabsStore.setState({ activeTabId: 'native:home', tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }] });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => {
      const data = path.endsWith('home-pipeline.json') ? homePipeline : path.endsWith('home.json') ? homeData : manifest;
      return { ok: true, json: async () => data };
    }));
  });

  it('renders the production pipeline layout in Demo Mode without making live API calls', async () => {
    useModeStore.setState({ mode: 'demo' });
    useAuthStore.setState({ session: { status: 'disconnected' } as any });

    renderDashboard();

    expect(screen.getByRole('status', { name: 'Loading your GitHub workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
    expect(screen.getByText('Pipeline Preview')).toBeInTheDocument();
    expect(screen.queryByText('Activity Pipeline Preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument());
    expect(screen.queryByText('Repository names overflow compact cards at narrow widths')).not.toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'Open Issues in Account Flow' });
    expect(more).toHaveTextContent('+4 more');
    fireEvent.click(more);
    expect(useFlowStore.getState().getTabState('native:flow')).toMatchObject({ scope: 'account', filterStage: 'issues' });
    expect(screen.queryByText('Repository names overflow compact cards at narrow widths')).not.toBeInTheDocument();

    // Verify invoke was never called to fetch live data
    expect(invoke).not.toHaveBeenCalled();
  });

  it('routes metric clicks to filtered Account Flow and selects preview cards for Inspector', async () => {
    useModeStore.setState({ mode: 'demo' });
    useAuthStore.setState({ session: { status: 'disconnected' } as any });
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('button', { name: /Pull request #186/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Pull request #186/ }));
    expect(useFlowStore.getState().getTabState('native:home').selectedFlowItem?.id).toBe('demo-pr-186');
    fireEvent.click(screen.getByRole('button', { name: /Failing Checks:/ }));
    expect(useFlowStore.getState().getTabState('native:flow')).toMatchObject({
      statusFilter: 'failing',
      filterStage: 'checks',
      hideEmptyStages: false,
      sourceContext: 'Opened from Home: Failing checks',
    });

    fireEvent.click(screen.getByRole('button', { name: /Reviews Requested:/ }));
    expect(useFlowStore.getState().getTabState('native:flow')).toMatchObject({ statusFilter: 'waiting_review', filterStage: 'review' });

    fireEvent.click(screen.getByRole('button', { name: /Recently Merged/ }));
    expect(useFlowStore.getState().getTabState('native:flow')).toMatchObject({ statusFilter: 'merged', filterStage: 'merged' });

    fireEvent.click(screen.getByRole('button', { name: /Needs Attention:/ }));
    expect(useFlowStore.getState().getTabState('native:flow')).toMatchObject({ statusFilter: 'attention', hideEmptyStages: true });
    expect(useFlowStore.getState().getTabState('native:flow').filterStage).toBeUndefined();
  });

  it('reveals the matching pipeline card when an item is selected from a bottom panel', async () => {
    useModeStore.setState({ mode: 'demo' });
    useAuthStore.setState({ session: { status: 'disconnected' } as any });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Recent Merges')).toBeInTheDocument());
    const mergeRows = document.querySelectorAll<HTMLButtonElement>('.home-lower > section:nth-child(2) .home-list-row > button:first-child');
    expect(mergeRows.length).toBeGreaterThan(0);
    fireEvent.click(mergeRows[mergeRows.length - 1]);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' }));
    expect(useFlowStore.getState().getTabState('native:home').selectedItemId).toBeTruthy();
  });
});
