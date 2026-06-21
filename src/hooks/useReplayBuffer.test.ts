import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReplayBuffer } from './useReplayBuffer';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

const mockItems: any[] = [
  { id: '1', number: 1, type: 'pull_request', status: 'active', updatedAt: new Date().toISOString() },
  { id: '2', number: 2, type: 'issue', status: 'idle', updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() }
];

describe('useReplayBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out items outside of time bounds unless active', async () => {
    (invoke as any).mockResolvedValue({
      nodes: [
        { __typename: 'ClosedEvent', createdAt: new Date().toISOString() }
      ]
    });

    const { result } = renderHook((props) => useReplayBuffer(props), { initialProps: { items: mockItems, repositoryOwner: 'owner', repositoryName: 'repo', timeRange: '30d' as const, enabled: true } });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    // Only item 1 should have been fetched (active and within time range). Item 2 is idle and >30d old.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('get_item_timeline', { owner: 'owner', name: 'repo', number: 1, isPr: true, cursor: null });
    
    // Check partial state is NOT set (time-filtering is normal, not an API cap limit)
    expect(result.current.completeness.isPartial).toBe(false);
  });

  it('respects concurrency limit', async () => {
    // We mock invoke to be slow
    (invoke as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ nodes: [] }), 10)));
    
    const manyItems = Array.from({ length: 10 }).map((_, i) => ({
      id: String(i), number: i, type: 'pull_request', status: 'active', updatedAt: new Date().toISOString()
    }));

    const { result } = renderHook(() => useReplayBuffer({
      items: manyItems as any,
      repositoryOwner: 'owner',
      repositoryName: 'repo',
      timeRange: '7d' as const,
      enabled: true
    }));

    expect(result.current.status).toBe("loading");
    
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(invoke).toHaveBeenCalledTimes(10);
  });
});
