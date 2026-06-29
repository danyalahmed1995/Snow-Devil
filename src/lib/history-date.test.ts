import { describe, expect, it } from 'vitest';
import { calendarDateInTimeZone, cutoffForCalendarDate, endOfCalendarDate, historyCalendarCutoffs, todayCalendarDate } from './history-date';

const ZONE = 'Asia/Karachi';

describe('History business-timezone dates', () => {
  it('resolves the local date when UTC and Karachi are on different days', () => {
    expect(todayCalendarDate(ZONE, '2026-06-28T20:30:00.000Z')).toBe('2026-06-29');
    expect(calendarDateInTimeZone('2026-06-28T18:59:59.999Z', ZONE)).toBe('2026-06-28');
    expect(calendarDateInTimeZone('2026-06-28T19:00:00.000Z', ZONE)).toBe('2026-06-29');
  });

  it('converts a calendar date to the exact Karachi end-of-day cutoff', () => {
    expect(endOfCalendarDate('2026-06-28', ZONE)).toBe('2026-06-28T18:59:59.999Z');
  });

  it('includes the local end of June 28 and excludes June 29', () => {
    const cutoff = cutoffForCalendarDate('2026-06-28', '2026-06-30T00:00:00.000Z', ZONE);
    expect('2026-06-28T18:59:59.999Z' <= cutoff).toBe(true);
    expect('2026-06-28T19:00:00.000Z' <= cutoff).toBe(false);
  });

  it('deduplicates meaningful timestamps into shared local-day cutoffs', () => {
    expect(historyCalendarCutoffs(['2026-06-28T01:00:00Z', '2026-06-28T18:00:00Z', '2026-06-28T20:00:00Z'], '2026-06-30T00:00:00Z', ZONE)).toEqual([
      '2026-06-28T18:59:59.999Z',
      '2026-06-29T18:59:59.999Z',
    ]);
  });
});
