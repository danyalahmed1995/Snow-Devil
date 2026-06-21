import { describe, expect, it } from 'vitest';
import { ageBandForDays, businessDaysBetween, businessHoursBetween } from './business-time';
import { detectOutliers, percentile } from './math';

const calendar = { timeZone: 'UTC', businessDays: [1, 2, 3, 4, 5] };

describe('business time', () => {
  it('excludes weekends while preserving fractional business hours', () => {
    expect(businessHoursBetween('2026-06-19T12:00:00Z', '2026-06-22T12:00:00Z', calendar)).toBe(24);
    expect(businessDaysBetween('2026-06-19T12:00:00Z', '2026-06-22T12:00:00Z', calendar)).toBe(1);
  });

  it('uses configurable work days and stable age bands', () => {
    expect(businessHoursBetween('2026-06-20T00:00:00Z', '2026-06-21T00:00:00Z', { timeZone: 'UTC', businessDays: [6] })).toBe(24);
    expect(ageBandForDays(3.99, { agingDays: 4, staleDays: 10 })).toBe('in_flight');
    expect(ageBandForDays(4, { agingDays: 4, staleDays: 10 })).toBe('aging');
    expect(ageBandForDays(10, { agingDays: 4, staleDays: 10 })).toBe('stale');
  });
});

describe('analytics math', () => {
  it('calculates interpolated percentiles and outliers', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([], 90)).toBeNull();
    expect(detectOutliers([1, 2, 2, 3, 3, 4, 20])).toEqual([20]);
  });
});
