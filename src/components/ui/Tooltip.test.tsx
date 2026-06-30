import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateTooltipPosition, TooltipProvider } from './Tooltip';

afterEach(() => vi.useRealTimers());

describe('shared contextual tooltip', () => {
  it('opens after hover delay, connects accessibly, and closes on leave', () => {
    vi.useFakeTimers();
    render(<TooltipProvider><button data-tooltip={'Meaning\nActivation result'}>Target</button></TooltipProvider>);
    const target = screen.getByRole('button');
    fireEvent.pointerOver(target);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Meaning Activation result');
    expect(target).toHaveAttribute('aria-describedby', 'snow-devil-contextual-tooltip');
    fireEvent.pointerOut(target);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('supports keyboard focus, Escape, and only one visible tooltip', () => {
    vi.useFakeTimers();
    render(<TooltipProvider><><button data-tooltip="First">First</button><button data-tooltip="Second">Second</button></></TooltipProvider>);
    fireEvent.focusIn(screen.getByText('First'));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toHaveTextContent('First');
    fireEvent.focusIn(screen.getByText('Second'));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Second');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('flips above and clamps within viewport edges', () => {
    expect(calculateTooltipPosition({ top: 90, bottom: 110, left: 95, right: 115, width: 20, height: 20, x: 95, y: 90, toJSON() {} }, { width: 80, height: 40 }, { width: 120, height: 120 })).toEqual({ left: 32, top: 42, placement: 'top' });
  });

  it('cleans its delayed open on unmount', () => {
    vi.useFakeTimers();
    const view = render(<TooltipProvider><button data-tooltip="Gone">Target</button></TooltipProvider>);
    fireEvent.pointerOver(screen.getByRole('button'));
    view.unmount();
    expect(() => act(() => vi.runAllTimers())).not.toThrow();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('shows the complete truncated title and remains usable with Reduced Motion', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.reducedMotion = 'true';
    const full = 'A deliberately long pull request title that is visually truncated in its row';
    render(<TooltipProvider><button data-tooltip={`${full}\nocto/app #42 · Select to inspect.`}>Short title…</button></TooltipProvider>);
    fireEvent.focusIn(screen.getByRole('button'));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toHaveTextContent(full);
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'snow-devil-contextual-tooltip');
    delete document.documentElement.dataset.reducedMotion;
  });
});
