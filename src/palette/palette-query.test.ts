import { describe, expect, it } from 'vitest';
import { parsePaletteQuery, rankResults } from './palette-query';

describe('palette query', () => {
  it('extracts supported filters and preserves unknown tokens', () => {
    expect(parsePaletteQuery('fix repo:nova/snow type:pr owner:me')).toEqual({ text: 'fix owner:me', filters: { repo: ['nova/snow'], type: ['pr'] }, unknown: ['owner:me'] });
  });

  it('filters, fuzzy ranks, and prefers local duplicates', () => {
    const results = rankResults([
      { id: 'one', type: 'file', title: 'RepositoryExplorer.tsx', repository: 'nova/snow', source: 'remote' as const },
      { id: 'one', type: 'file', title: 'RepositoryExplorer.tsx', repository: 'nova/snow', source: 'local' as const },
      { id: 'two', type: 'issue', title: 'Explorer polish', repository: 'nova/snow', source: 'local' as const },
    ], 'repo:nova type:file repoexp');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('local');
  });
});
