import { describe, expect, it } from 'vitest';
import { centeredHistoryScrollTop } from './history-reveal';

describe('history row reveal geometry', () => {
  it('converts viewport rectangles into the internal scroller coordinate space', () => {
    expect(centeredHistoryScrollTop({ scrollTop: 900, containerTop: 300, containerHeight: 290, rowTop: 420, rowHeight: 42 })).toBe(896);
  });

  it('clamps targets near the start without moving the document', () => {
    expect(centeredHistoryScrollTop({ scrollTop: 0, containerTop: 300, containerHeight: 290, rowTop: 310, rowHeight: 42 })).toBe(0);
  });
});
