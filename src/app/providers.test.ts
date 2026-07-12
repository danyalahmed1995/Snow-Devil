import { afterEach, describe, expect, it } from 'vitest';
import { MAX_INACTIVE_QUERY_ENTRIES, queryClient } from './providers';

describe('query cache ownership bounds', () => {
  afterEach(() => queryClient.clear());

  it('evicts the oldest inactive queries at the configured maximum', () => {
    queryClient.clear();
    for (let index = 0; index < MAX_INACTIVE_QUERY_ENTRIES + 25; index += 1) {
      queryClient.setQueryData(['leak-qualification', index], { index });
    }
    const retained = queryClient.getQueryCache().findAll({ queryKey: ['leak-qualification'] });
    expect(retained).toHaveLength(MAX_INACTIVE_QUERY_ENTRIES);
    expect(retained.some(query => query.queryKey[1] === 0)).toBe(false);
    expect(retained.some(query => query.queryKey[1] === MAX_INACTIVE_QUERY_ENTRIES + 24)).toBe(true);
  });
});
