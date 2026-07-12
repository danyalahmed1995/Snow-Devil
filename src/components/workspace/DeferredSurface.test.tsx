import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredSurface } from './DeferredSurface';

describe('DeferredSurface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('paints the shared loader before mounting heavy content', async () => {
    render(<DeferredSurface identity="native:inventory" title="Loading Delivery Risks" detail="Analyzing evidence…"><div>Heavy content</div></DeferredSurface>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Delivery Risks');
    expect(screen.queryByText('Heavy content')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(17); });
    expect(screen.getByText('Heavy content')).toBeInTheDocument();
  });

  it('cancels activation when switched away', () => {
    const { unmount } = render(<DeferredSurface identity="native:inventory" title="Loading" detail="Waiting"><div>Heavy content</div></DeferredSurface>);
    unmount();
    act(() => vi.runAllTimers());
    expect(screen.queryByText('Heavy content')).not.toBeInTheDocument();
  });
});
