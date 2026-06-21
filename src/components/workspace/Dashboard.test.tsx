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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => {
      const data = path.endsWith('home-pipeline.json') ? homePipeline : path.endsWith('home.json') ? homeData : manifest;
      return { ok: true, json: async () => data };
    }));
  });

  it('renders the production pipeline layout in Demo Mode without making live API calls', async () => {
    useModeStore.setState({ mode: 'demo' });
    useAuthStore.setState({ session: { status: 'disconnected' } as any });

    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Account Flow' })).toBeInTheDocument();
    expect(screen.getByText('Active Pipeline')).toBeInTheDocument();
    expect(screen.queryByText('Activity Pipeline Preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Deployment rollback telemetry is missing for failed canary releases')).toBeInTheDocument());
    expect(screen.getByText('5+')).toBeInTheDocument();
    expect(screen.queryByText('Repository names overflow compact cards at narrow widths')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more issues' }));
    expect(screen.getByText('Repository names overflow compact cards at narrow widths')).toBeInTheDocument();

    // Verify invoke was never called to fetch live data
    expect(invoke).not.toHaveBeenCalled();
  });
});
