import { describe, expect, it } from 'vitest';
import { defaultHistoryView, normalizeHistoryFilters } from './history-view-store';

describe('history view filter recovery', () => {
  it('recovers legacy Account History navigation filters containing an author login', () => {
    const legacy = { ...defaultHistoryView('account').filters, repository: 'danyalahmed1995/EXT', actor: 'danyalahmed1995', includeBots: true };
    expect(normalizeHistoryFilters(legacy, 'account')).toEqual(defaultHistoryView('account').filters);
  });

  it('preserves supported account filters', () => {
    const supported = { ...defaultHistoryView('account').filters, repository: 'danyalahmed1995/EXT', actor: 'everyone', includeBots: true };
    expect(normalizeHistoryFilters(supported, 'account')).toBe(supported);
  });
});
