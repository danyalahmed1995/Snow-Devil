import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { BrowserHydrator } from './BrowserHydrator';
import { useTabsStore } from '../stores/tabs-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { invoke, browserCreate } = vi.hoisted(() => ({ invoke: vi.fn(), browserCreate: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

vi.mock('./browser-commands', () => ({ browserCreate }));

describe('BrowserHydrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabsStore.setState({ tabs: [], activeTabId: '' });
  });

  it('waits for persistence and leaves restored background WebViews dormant', async () => {
    const queryClient = new QueryClient();
    let hydrationCallback: () => void = () => {};
    invoke.mockResolvedValue({});
    
    // Mock the persist object
    (useTabsStore as any).persist = {
      hasHydrated: () => false,
      onFinishHydration: (cb: () => void) => {
        hydrationCallback = cb;
        return () => {};
      }
    };

    const home = { id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 };
    const browserTabs = Array.from({ length: 8 }).map((_, index) => ({
      id: `browser-${index}`,
      family: 'browser',
      kind: 'pullRequest',
      title: `PR ${index}`,
      canonicalUrl: `https://github.com/acme/repo/pull/${index}`,
      currentUrl: `https://github.com/acme/repo/pull/${index}`,
      history: [`https://github.com/acme/repo/pull/${index}`],
      historyIndex: 0,
      lifecycle: 'uninitialized',
      pinned: false,
      closable: true,
      createdAt: index + 2,
      lastActivatedAt: index + 2,
    }));
    useTabsStore.setState({ tabs: [home, ...browserTabs] as any, activeTabId: 'native:home' });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserHydrator />
      </QueryClientProvider>
    );

    // Should not start yet because persist hasn't hydrated
    expect(browserCreate).not.toHaveBeenCalled();

    // Trigger hydration
    act(() => hydrationCallback());

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_account_home_summary'));
    expect(browserCreate).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs.filter(tab => tab.family === 'browser').every(tab => tab.lifecycle === 'uninitialized')).toBe(true);
  });
});
