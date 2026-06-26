import { describe, expect, it } from 'vitest';
import { matchesStructuredSearch, parseStructuredSearch } from './structured-search';

describe('structured work search', () => {
  it('parses quoted filters and combines terms with AND semantics', () => {
    expect(parseStructuredSearch('repo:EXT title:"font face" checks:failed')).toEqual([
      { key: 'repo', value: 'ext', raw: 'repo:EXT' },
      { key: 'title', value: 'font face', raw: 'title:"font face"' },
      { key: 'checks', value: 'failed', raw: 'checks:failed' },
    ]);
    expect(matchesStructuredSearch({ repository: 'owner/EXT', title: 'Fix font face loading', checks: 'failed' }, 'repo:ext title:"font face" checks:failed')).toBe(true);
    expect(matchesStructuredSearch({ repository: 'owner/EXT', title: 'Fix font face loading', checks: 'success' }, 'repo:ext title:"font face" checks:failed')).toBe(false);
  });

  it('supports numbers, booleans, confidence, related:none, and age comparisons', () => {
    const item = { title: 'Fix parser', repository: 'octo/app', number: 37, isDraft: true, confidence: 'exact', related: [], ageDays: 12 };
    expect(matchesStructuredSearch(item, '#37 is:draft confidence:exact related:none age:>10d')).toBe(true);
  });
});
