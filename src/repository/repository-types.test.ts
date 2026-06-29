import { describe, expect, it } from 'vitest';
import { classifyFile, normalizeTree, treeCacheKey } from './repository-types';

describe('repository browser utilities', () => {
  it('orders folders before files', () => expect(normalizeTree([{ name: 'z.ts', path: 'z.ts', type: 'blob' }, { name: 'src', path: 'src', type: 'tree' }]).map(item => item.name)).toEqual(['src', 'z.ts']));
  it('builds ref-safe cache keys', () => expect(treeCacheKey('o/r', 'feature/a', 'src')).toBe('o/r@feature/a:src'));
  it('classifies safe preview modes', () => {
    expect(classifyFile('README.md', 20, 'hello')).toBe('markdown');
    expect(classifyFile('app.zip', 20, null)).toBe('binary');
    expect(classifyFile('huge.ts', 1_000_001, 'x')).toBe('large');
  });
});
