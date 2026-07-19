import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveBrowserRuntimeSync } from './ActiveBrowserRuntimeSync';
import { useTabsStore } from '../stores/tabs-store';

const { browserGetState } = vi.hoisted(() => ({ browserGetState: vi.fn() }));
vi.mock('./browser-commands', () => ({ browserGetState }));

describe('active native browser runtime reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabsStore.setState({
      activeTabId: 'browser-pr',
      tabs: [{
        id: 'browser-pr', family: 'browser', kind: 'pullRequest', title: 'PR #42', canonicalUrl: 'https://github.com/octo/app/pull/42',
        currentUrl: 'https://github.com/octo/app/pull/42', history: ['https://github.com/octo/app/pull/42'], historyIndex: 0,
        lifecycle: 'resident', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1,
      } as any],
    });
  });

  it('records a WebView SPA route so the address bar and history stay current', async () => {
    browserGetState.mockResolvedValue({ tabId: 'browser-pr', currentUrl: 'https://github.com/octo/app/pull/42/files', canGoBack: null, canGoForward: null, loading: false });
    render(<ActiveBrowserRuntimeSync />);
    await waitFor(() => expect(useTabsStore.getState().getActiveBrowserTab()?.currentUrl).toBe('https://github.com/octo/app/pull/42/files'));
    expect(useTabsStore.getState().getActiveBrowserTab()?.history).toEqual(['https://github.com/octo/app/pull/42', 'https://github.com/octo/app/pull/42/files']);
  });

  it('does not poll WebView state while a native surface is active', () => {
    useTabsStore.setState({
      activeTabId: 'native:home',
      tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 } as any],
    });
    const setInterval = vi.spyOn(window, 'setInterval');
    render(<ActiveBrowserRuntimeSync />);
    expect(setInterval).not.toHaveBeenCalled();
    expect(browserGetState).not.toHaveBeenCalled();
  });
});
