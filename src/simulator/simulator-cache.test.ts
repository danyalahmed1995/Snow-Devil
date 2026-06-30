import { describe, expect, it } from 'vitest';
import { parseSimulatorCacheObject } from './simulator-cache';

describe('simulator cache validation', () => {
  it('contains malformed persisted JSON instead of breaking history hydration', () => {
    expect(parseSimulatorCacheObject('{broken')).toBeUndefined();
    expect(parseSimulatorCacheObject('["not", "an", "object"]')).toBeUndefined();
    expect(parseSimulatorCacheObject('{"login":"octo"}')).toEqual({ login: 'octo' });
  });
});
