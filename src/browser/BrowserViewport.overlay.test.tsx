import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserViewport } from './BrowserViewport';
import { useTabsStore } from '../stores/tabs-store';
import { useOverlayStore } from '../stores/overlay-store';

vi.mock('./browser-commands', () => ({
  browserCreate: vi.fn().mockResolvedValue(undefined),
  browserResize: vi.fn().mockResolvedValue(undefined),
  browserActivate: vi.fn().mockResolvedValue(undefined),
  browserClose: vi.fn().mockResolvedValue(undefined),
  browserHideAll: vi.fn().mockResolvedValue(undefined),
}));

describe('webview-aware overlay coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOverlayStore.setState({ activeOverlayId: undefined });
    useTabsStore.setState({ tabs: [{ id: 'browser-1', family: 'browser', kind: 'issue', title: 'Issue', canonicalUrl: 'https://github.com/octo/app/issues/1', currentUrl: 'https://github.com/octo/app/issues/1', history: ['https://github.com/octo/app/issues/1'], historyIndex: 0, lifecycle: 'uninitialized', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'browser-1' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 80, width: 900, height: 600, top: 80, right: 920, bottom: 680, left: 20, toJSON: () => ({}) } as DOMRect);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  });

  it('hides the child webview for a global overlay and reactivates the same resident page afterward', async () => {
    render(<BrowserViewport />);
    const commands = await import('./browser-commands');
    await waitFor(() => expect(commands.browserActivate).toHaveBeenCalled());
    useOverlayStore.getState().openOverlay('command-palette');
    await waitFor(() => expect(commands.browserHideAll).toHaveBeenCalled());
    useOverlayStore.getState().closeOverlay('command-palette');
    await waitFor(() => expect(commands.browserActivate).toHaveBeenCalledTimes(2));
    expect(commands.browserCreate).toHaveBeenLastCalledWith('browser-1', 'https://github.com/octo/app/issues/1', expect.any(Object));
  });

  it('disposes a native webview when creation completes after its React owner closes', async () => {
    const commands = await import('./browser-commands');
    let finishCreate!: () => void;
    vi.mocked(commands.browserCreate).mockImplementationOnce(() => new Promise<void>(resolve => { finishCreate = resolve; }));
    const view = render(<BrowserViewport />);
    await waitFor(() => expect(commands.browserCreate).toHaveBeenCalled());
    useTabsStore.setState({ tabs: [], activeTabId: 'native:home' });
    view.unmount();
    finishCreate();
    await waitFor(() => expect(commands.browserClose).toHaveBeenCalledWith('browser-1'));
    expect(commands.browserActivate).not.toHaveBeenCalled();
  });
});
