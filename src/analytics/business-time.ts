import type { AgeBand, AnalyticsSettings, InventoryThresholds } from './types';
import { setBoundedMap } from '../lib/bounded-cache';

export interface BusinessCalendar {
  timeZone: string;
  businessDays: number[];
}

const weekdayCache = new Map<string, number>();

function weekdayAt(value: Date, timeZone: string): number {
  const hourBucket = Math.floor(value.getTime() / (60 * 60 * 1000));
  const cacheKey = `${timeZone}:${hourBucket}`;
  const cached = weekdayCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(value);
  const result = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
  // Covers more than two years of hourly buckets without eviction churn during
  // one large historical analysis while still imposing a deterministic cap.
  setBoundedMap(weekdayCache, cacheKey, result, 20_000);
  return result;
}

export function businessHoursBetween(startValue: string | Date, endValue: string | Date, calendar: BusinessCalendar): number {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  let total = 0;
  let cursor = start;
  const hour = 60 * 60 * 1000;
  while (cursor < end) {
    const boundary = Math.min(end, Math.floor(cursor / hour) * hour + hour);
    const midpoint = new Date(cursor + (boundary - cursor) / 2);
    if (calendar.businessDays.includes(weekdayAt(midpoint, calendar.timeZone))) {
      total += boundary - cursor;
    }
    cursor = boundary;
  }
  return total / hour;
}

export function businessDaysBetween(startValue: string | Date, endValue: string | Date, calendar: BusinessCalendar): number {
  return businessHoursBetween(startValue, endValue, calendar) / 24;
}

export function ageBandForDays(days: number, thresholds: InventoryThresholds): AgeBand {
  if (days >= thresholds.staleDays) return 'stale';
  if (days >= thresholds.agingDays) return 'aging';
  return 'in_flight';
}

export function calendarFromSettings(settings: AnalyticsSettings): BusinessCalendar {
  return { timeZone: settings.businessTimezone, businessDays: settings.businessDays };
}
