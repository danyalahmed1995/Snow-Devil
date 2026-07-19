import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENSHOT_HOLD_DELAY_MS, ScreenshotRuntime, selectionFromPoints } from './ScreenshotRuntime';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
});

describe('screenshot selection geometry', () => {
  it('normalizes a drag in any direction', () => {
    expect(selectionFromPoints({ x: 90, y: 75 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, width: 70, height: 45 });
    expect(selectionFromPoints({ x: 20, y: 30 }, { x: 90, y: 75 })).toEqual({ x: 20, y: 30, width: 70, height: 45 });
  });

  it('does not enter capture mode for a normal right click', () => {
    vi.useFakeTimers();
    render(<ScreenshotRuntime />);

    fireEvent.pointerDown(window, { button: 2, buttons: 2, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(window, { button: 2, buttons: 0, clientX: 20, clientY: 30 });
    act(() => vi.advanceTimersByTime(SCREENSHOT_HOLD_DELAY_MS));

    expect(document.querySelector('.screenshot-selection-layer')).not.toBeInTheDocument();
  });

  it('enters capture mode only after right click is held', () => {
    vi.useFakeTimers();
    render(<ScreenshotRuntime />);

    fireEvent.pointerDown(window, { button: 2, buttons: 2, clientX: 20, clientY: 30 });
    act(() => vi.advanceTimersByTime(SCREENSHOT_HOLD_DELAY_MS - 1));
    expect(document.querySelector('.screenshot-selection-layer')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('.screenshot-selection-layer')).toBeInTheDocument();
  });
});
