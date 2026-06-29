import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListView } from './ListView';
import { invoke } from '@tauri-apps/api/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth-store';

describe('ListView Component', () => {
  const renderList = (type: string) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ListView type={type} /></QueryClientProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      session: {
        status: 'connected',
        account: { login: 'testuser', name: 'Test User', avatarUrl: '', organizations: { totalCount: 2, nodes: [] } },
      },
      isAuthenticated: true,
    });
  });

  it('renders loading state initially', () => {
    renderList('repositories');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders repository list rendering', async () => {
    renderList('repositories');
    await waitFor(() => {
      expect(screen.getByText('testuser/repo1')).toBeInTheDocument();
    });
  });

  it('renders pull request list rendering', async () => {
    renderList('pullRequests');
    await waitFor(() => {
      expect(screen.getByText('Fix bug')).toBeInTheDocument();
      expect(screen.getByText('testuser/repo1 #1')).toBeInTheDocument();
    });
  });

  it('renders issue list rendering', async () => {
    renderList('issues');
    await waitFor(() => {
      expect(screen.getByText('Bug found')).toBeInTheDocument();
      expect(screen.getByText('testuser/repo1 #2')).toBeInTheDocument();
    });
  });

  it('proves Retry performs a real second request', async () => {
    // 1. First invocation occurs and fails
    (invoke as any).mockRejectedValueOnce(new Error('Network failure'));
    
    renderList('repositories');
    
    // 3. Error state appears
    await waitFor(() => {
      expect(screen.getByText(/Network failure/)).toBeInTheDocument();
    });
    
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
    
    // Setup second invocation to succeed
    (invoke as any).mockResolvedValueOnce([
      { id: 'r2', nameWithOwner: 'recovered/repo', description: '' }
    ]);
    
    // 4. Retry is clicked
    fireEvent.click(retryButton);
    
    // 5 & 6. Second invocation occurs and succeeds
    // 7. Success content appears
    await waitFor(() => {
      expect(screen.getByText('recovered/repo')).toBeInTheDocument();
    });
  });
});
