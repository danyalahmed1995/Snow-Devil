import { describe, expect, it } from 'vitest';
import { loadingMotionClass, resolveDataViewState } from './data-state';

describe('data view states', () => {
  it('distinguishes initial loading from a legitimate loaded empty snapshot', () => {
    expect(resolveDataViewState({ loading: true })).toBe('initial-loading');
    expect(resolveDataViewState({ hasSnapshot: true, empty: true })).toBe('empty');
  });

  it('keeps a snapshot visible while refreshing and reports partial data separately', () => {
    expect(resolveDataViewState({ fetching: true, hasSnapshot: true })).toBe('refreshing-with-snapshot');
    expect(resolveDataViewState({ hasSnapshot: true, partial: true })).toBe('partial');
  });

  it('uses static loading treatment for reduced motion', () => {
    expect(loadingMotionClass(true)).toBe('is-static-loading');
    expect(loadingMotionClass(false)).toBe('is-animated-loading');
  });
});
