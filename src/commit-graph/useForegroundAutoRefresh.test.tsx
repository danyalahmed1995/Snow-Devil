import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_GRAPH_AUTO_REFRESH_MS, useForegroundAutoRefresh } from './useForegroundAutoRefresh';

function Harness({ enabled, refresh }: { enabled: boolean; refresh: () => Promise<unknown> }) {
  useForegroundAutoRefresh(enabled, refresh);
  return null;
}

describe('Commit Graph foreground auto-refresh', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('refreshes every minute and cleans up after unmount', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const refresh = vi.fn(async () => undefined);
    const view = render(<Harness enabled refresh={refresh}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS * 2); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('pauses while blurred and resumes with a fresh bounded interval', async () => {
    vi.useFakeTimers();
    let focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    const refresh = vi.fn(async () => undefined);
    render(<Harness enabled refresh={refresh}/>);
    focused = false;
    act(() => window.dispatchEvent(new Event('blur')));
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS * 2); });
    expect(refresh).not.toHaveBeenCalled();
    focused = true;
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not overlap a refresh that is still in flight', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    let finish: (() => void) | undefined;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<Harness enabled refresh={refresh}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS * 3); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => finish?.());
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_GRAPH_AUTO_REFRESH_MS); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
