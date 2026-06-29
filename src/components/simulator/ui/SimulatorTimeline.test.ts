import { describe, expect, it } from 'vitest';
import { clampTooltipPosition } from './SimulatorTimeline';

describe('simulator timeline tooltip clamping', () => {
  it.each([[0, 4], [1, 4], [50, 40], [99, 76], [100, 76]])('keeps the tooltip inside at %s%%', (percent, expected) => {
    expect(clampTooltipPosition(percent, 20, 100)).toBe(expected);
  });

  it('reclamps after resize and handles a label as wide as the track', () => {
    expect(clampTooltipPosition(99, 20, 60)).toBe(36);
    expect(clampTooltipPosition(50, 92, 100)).toBe(4);
  });
});
