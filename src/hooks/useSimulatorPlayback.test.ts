import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSimulatorPlayback } from './useSimulatorPlayback';
import type { SimulatorEvent } from '../simulator/simulator-types';

const event = (id: string, occurredAt: string): SimulatorEvent => ({
  id,
  source: 'test',
  occurredAt,
  repositoryId: 'octo/app',
  repositoryName: 'app',
  repositoryOwner: 'octo',
  subjectId: 'pr-1',
  subjectType: 'pull_request',
  subjectNumber: 1,
  subjectTitle: 'PR',
  eventType: id === 'opened' ? 'opened' : 'approved',
  metadata: {},
  sourceCompleteness: 'complete',
});

describe('simulator meaningful playback', () => {
  afterEach(() => vi.useRealTimers());
  it('steps and plays through distinct meaningful state-change timestamps atomically', () => {
    vi.useFakeTimers();
    const events = [event('opened', '2026-01-01T00:00:00Z'), event('approved', '2026-01-02T00:00:00Z')];
    const { result } = renderHook(() => useSimulatorPlayback(events, '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'));
    act(() => result.current.setCursorManual('2026-01-01T00:00:00Z'));
    act(() => result.current.stepForward());
    expect(result.current.cursor).toBe('2026-01-02T00:00:00Z');
    act(() => {
      result.current.setCursorManual('2026-01-01T00:00:00Z');
      result.current.setSpeedMultiplier(4);
      result.current.play();
    });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.cursor).toBe('2026-01-02T00:00:00Z');
    expect(result.current.currentState.get('pr-1')?.reviewState).toBe('approved');
  });

  it('normalizes picker and slider values to one Karachi calendar cutoff', () => {
    const events = [event('opened', '2026-06-28T18:30:00Z'), event('approved', '2026-06-28T19:30:00Z')];
    const { result } = renderHook(() => useSimulatorPlayback(events, '2026-06-27T19:00:00Z', '2026-06-29T12:00:00Z', { timeZone: 'Asia/Karachi' }));
    act(() => result.current.setCursorManual('2026-06-28T10:00:00Z'));
    expect(result.current.cursor).toBe('2026-06-28T18:59:59.999Z');
    act(() => result.current.stepForward());
    expect(result.current.cursor).toBe('2026-06-29T12:00:00Z');
  });

  it('preserves a selected cutoff when a refreshed snapshot extends the latest boundary', () => {
    const events = [event('opened', '2026-06-01T00:00:00Z')];
    const { result, rerender } = renderHook(({ until }) => useSimulatorPlayback(events, '2026-06-01T00:00:00Z', until), { initialProps: { until: '2026-06-03T00:00:00Z' } });
    act(() => result.current.setCursorManual('2026-06-02T00:00:00Z'));
    rerender({ until: '2026-06-04T00:00:00Z' });
    expect(result.current.cursor).toBe('2026-06-02T00:00:00Z');
  });

  it('keeps Today synchronized when a refresh advances the latest boundary', () => {
    const events = [event('opened', '2026-06-01T00:00:00Z')];
    const { result, rerender } = renderHook(({ until }) => useSimulatorPlayback(events, '2026-06-01T00:00:00Z', until), { initialProps: { until: '2026-06-03T00:00:00Z' } });
    rerender({ until: '2026-06-04T00:00:00Z' });
    expect(result.current.cursor).toBe('2026-06-04T00:00:00Z');
  });

  it('uses non-animated stepping when Reduced Motion is enabled', () => {
    const events = [event('opened', '2026-01-01T00:00:00Z'), event('approved', '2026-01-02T00:00:00Z')];
    const { result } = renderHook(() => useSimulatorPlayback(events, '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z', { reducedMotion: true }));
    act(() => result.current.setCursorManual('2026-01-01T00:00:00Z'));
    act(() => result.current.play());
    expect(result.current.cursor).toBe('2026-01-02T00:00:00Z');
    expect(result.current.isPlaying).toBe(false);
  });
});
