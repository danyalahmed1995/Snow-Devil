import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListView } from './ListView';
import { invoke } from '@tauri-apps/api/core';

describe('ListView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<ListView type="repositories" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders repository list rendering', async () => {
    render(<ListView type="repositories" />);
    await waitFor(() => {
      expect(screen.getByText('testuser/repo1')).toBeInTheDocument();
    });
  });

  it('renders pull request list rendering', async () => {
    render(<ListView type="pullRequests" />);
    await waitFor(() => {
      expect(screen.getByText('Fix bug')).toBeInTheDocument();
      expect(screen.getByText('testuser/repo1 #1')).toBeInTheDocument();
    });
  });

  it('renders issue list rendering', async () => {
    render(<ListView type="issues" />);
    await waitFor(() => {
      expect(screen.getByText('Bug found')).toBeInTheDocument();
      expect(screen.getByText('testuser/repo1 #2')).toBeInTheDocument();
    });
  });

  it('proves Retry performs a real second request', async () => {
    // 1. First invocation occurs and fails
    (invoke as any).mockRejectedValueOnce(new Error('Network failure'));
    
    render(<ListView type="repositories" />);
    
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
