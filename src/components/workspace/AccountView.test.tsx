import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountView } from './AccountView';
import { useAuthStore } from '../../stores/auth-store';

describe('AccountView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correct account title and no user placeholder', async () => {
    useAuthStore.setState({
      session: {
        status: 'connected',
        account: {
          login: 'octocat',
          name: 'The Octocat',
          avatarUrl: '',
          url: '',
          repositories: { totalCount: 15 },
          organizations: { totalCount: 3 },
          pullRequests: { totalCount: 7 },
          issues: { totalCount: 4 }
        }
      }
    });

    render(<AccountView />);
    
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Octocat');
    expect(screen.queryByText('user')).not.toBeInTheDocument();
    expect(screen.getByText('@octocat')).toBeInTheDocument();
  });

  it('renders navigator counts', () => {
    useAuthStore.setState({
      session: {
        status: 'connected',
        account: {
          login: 'octocat',
          name: 'The Octocat',
          avatarUrl: '',
          url: '',
          repositories: { totalCount: 15 },
          organizations: { totalCount: 3 },
          pullRequests: { totalCount: 7 },
          issues: { totalCount: 4 }
        }
      }
    });

    render(<AccountView />);
    expect(screen.getByText('15')).toBeInTheDocument(); // Repos
    expect(screen.getByText('3')).toBeInTheDocument(); // Orgs
    expect(screen.getByText('7')).toBeInTheDocument(); // PRs
    expect(screen.getByText('4')).toBeInTheDocument(); // Issues
  });

  it('renders loading state', () => {
    useAuthStore.setState({ session: { status: 'checking' } });
    render(<AccountView />);
    expect(screen.getByText('Loading account details...')).toBeInTheDocument();
  });

  it('renders error state and handles retry', async () => {
    const checkAuthStatusMock = vi.fn();
    useAuthStore.setState({ 
      session: { status: 'error', message: 'Failed to authenticate' },
      checkAuthStatus: checkAuthStatusMock
    });
    
    render(<AccountView />);
    expect(screen.getByText('Failed to load account')).toBeInTheDocument();
    expect(screen.getByText('Failed to authenticate')).toBeInTheDocument();
    
    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);
    expect(checkAuthStatusMock).toHaveBeenCalledTimes(1);
  });
});
