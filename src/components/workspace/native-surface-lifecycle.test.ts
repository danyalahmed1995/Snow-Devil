import { describe, expect, it } from 'vitest';
import { shouldKeepNativeSurfaceMounted } from './native-surface-lifecycle';

describe('native surface lifecycle ownership', () => {
  it('keeps only Home mounted while inactive', () => {
    expect(shouldKeepNativeSurfaceMounted('home')).toBe(true);
    expect(shouldKeepNativeSurfaceMounted('accountSimulator')).toBe(false);
    expect(shouldKeepNativeSurfaceMounted('repositorySimulator')).toBe(false);
    expect(shouldKeepNativeSurfaceMounted('ciRun')).toBe(false);
    expect(shouldKeepNativeSurfaceMounted('inventory')).toBe(false);
  });
});
