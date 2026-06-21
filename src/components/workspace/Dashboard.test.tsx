import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { useModeStore } from '../../stores/mode-store';
import { useAuthStore } from '../../stores/auth-store';
import { invoke } from '@tauri-apps/api/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  });

  it('renders the production pipeline layout in Demo Mode without making live API calls', async () => {
    useModeStore.setState({ mode: 'demo' });
    useAuthStore.setState({ session: { status: 'disconnected' } as any });

    renderDashboard();

    // Verify it renders the real pipeline lanes (these text strings come from STAGES map)
    expect(screen.getByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('Pull Requests')).toBeInTheDocument();
    expect(screen.getByText('Merged')).toBeInTheDocument();

    // Verify no separate simplified demo list is used (the demo header is rendered, but pipeline remains)
    expect(screen.getByText('Demo Mode')).toBeInTheDocument();

    // Verify invoke was never called to fetch live data
    expect(invoke).not.toHaveBeenCalled();
  });
});
