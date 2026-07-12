import { describe, expect, it } from 'vitest';
import { setBoundedMap } from './bounded-cache';

describe('bounded map cache', () => {
  it('evicts oldest entries and refreshes replacement recency', () => {
    const cache = new Map<string, number>();
    setBoundedMap(cache, 'a', 1, 2);
    setBoundedMap(cache, 'b', 2, 2);
    setBoundedMap(cache, 'a', 3, 2);
    setBoundedMap(cache, 'c', 4, 2);
    expect([...cache.entries()]).toEqual([['a', 3], ['c', 4]]);
  });
});
