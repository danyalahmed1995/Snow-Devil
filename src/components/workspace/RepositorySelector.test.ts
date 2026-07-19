import { describe, expect, it } from 'vitest';
import { resolveRepositorySelectionId } from './RepositorySelector';

describe('RepositorySelector selection identity', () => {
  const repositories = [
    { id: 'repo-snow-devil', name: 'danyalahmed1995/Snow-Devil' },
    { id: 'repo-ext', name: 'danyalahmed1995/EXT' },
  ];

  it('reconciles a legacy owner/name id to the matching repository option', () => {
    expect(resolveRepositorySelectionId(repositories, { id: 'danyalahmed1995/EXT', nameWithOwner: 'danyalahmed1995/EXT' })).toBe('repo-ext');
  });

  it('preserves a canonical repository id', () => {
    expect(resolveRepositorySelectionId(repositories, { id: 'repo-snow-devil', nameWithOwner: 'danyalahmed1995/Snow-Devil' })).toBe('repo-snow-devil');
  });
});
