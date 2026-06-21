import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserHydrator } from './BrowserHydrator';
import { useTabsStore } from '../stores/tabs-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('./browser-commands', () => ({
  browserCreate: vi.fn().mockResolvedValue(true)
}));

describe('BrowserHydrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabsStore.setState({ tabs: [], activeTabId: '' });
  });

  it('waits for persistence hydration and processes queue correctly', async () => {
    const queryClient = new QueryClient();
    let hydrationCallback: () => void = () => {};
    
    // Mock the persist object
    (useTabsStore as any).persist = {
      hasHydrated: () => false,
      onFinishHydration: (cb: () => void) => {
        hydrationCallback = cb;
        return () => {};
      }
    };

    const tabs = Array.from({ length: 10 }).map((_, i) => ({
      id: `tab-${i}`,
      family: 'browser',
      kind: 'pull_request',
      lifecycle: 'uninitialized',
      lastActivatedAt: i * 1000 // Tab 9 is most recently used
    }));
    
    // Make tab 5 the active one
    useTabsStore.setState({ tabs: tabs as any, activeTabId: 'tab-5' });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserHydrator />
      </QueryClientProvider>
    );

    // Should not start yet because persist hasn't hydrated
    const { browserCreate } = await import('./browser-commands');
    expect(browserCreate).not.toHaveBeenCalled();

    // Trigger hydration
    hydrationCallback();

    await waitFor(() => {
      // Active tab (tab-5) should be called first, then top 5 MRU remaining (9, 8, 7, 6, 4)
      expect(browserCreate).toHaveBeenCalledTimes(6);
    });

    const calls = (browserCreate as any).mock.calls;
    expect(calls[0][0]).toBe('tab-5'); // active tab first
    
    // Check that we only hydrated 6 tabs
    expect(useTabsStore.getState().tabs.filter(t => (t as any).lifecycle === 'resident').length).toBe(6);
  });
});
