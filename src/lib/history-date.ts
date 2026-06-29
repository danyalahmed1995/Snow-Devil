export const DEFAULT_HISTORY_TIME_ZONE = 'Asia/Karachi';

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, value);
  return value;
}

function partsAt(value: Date | string | number, timeZone: string): CalendarParts {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function calendarDateParts(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function zonedDateTimeToUtc(parts: CalendarParts & { millisecond: number }, timeZone: string): string {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  let candidate = target;
  for (let index = 0; index < 4; index += 1) {
    const observed = partsAt(candidate, timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second, parts.millisecond);
    const next = candidate + target - observedAsUtc;
    if (Math.abs(next - candidate) < 1) break;
    candidate = next;
  }
  return new Date(candidate).toISOString();
}

export function calendarDateInTimeZone(value: Date | string | number, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  const parts = partsAt(value, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function startOfCalendarDate(value: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  const parts = calendarDateParts(value);
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
}

export function endOfCalendarDate(value: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  const parts = calendarDateParts(value);
  return zonedDateTimeToUtc({ ...parts, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone);
}

export function todayCalendarDate(timeZone = DEFAULT_HISTORY_TIME_ZONE, now: Date | string | number = Date.now()): string {
  return calendarDateInTimeZone(now, timeZone);
}

export function addCalendarDays(value: string, days: number): string {
  const parts = calendarDateParts(value);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function cutoffForCalendarDate(value: string, latest: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  const end = endOfCalendarDate(value, timeZone);
  return end > latest ? latest : end;
}

export function normalizeHistoryCutoff(value: string, latest: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  if (value >= latest) return latest;
  return cutoffForCalendarDate(calendarDateInTimeZone(value, timeZone), latest, timeZone);
}

export function formatHistoryCutoff(value: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

export function historyCalendarCutoffs(values: string[], latest: string, timeZone = DEFAULT_HISTORY_TIME_ZONE): string[] {
  return [...new Set(values.map(value => cutoffForCalendarDate(calendarDateInTimeZone(value, timeZone), latest, timeZone)))].sort();
}
