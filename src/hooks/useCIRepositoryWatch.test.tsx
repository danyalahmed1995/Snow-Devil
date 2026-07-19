import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCIWatcherStore } from '../stores/ci-watcher-store';
import { useCIRepositoryWatch } from './useCIRepositoryWatch';

describe('useCIRepositoryWatch', () => {
  beforeEach(() => useCIWatcherStore.setState({ activeAccount: 'octo', runsByRepository: {}, repositoryState: {}, subscriptions: {} }));

  it('owns and releases a repository-scoped global watcher subscription', () => {
    const hook = renderHook(({ repository, enabled }) => useCIRepositoryWatch(repository, enabled), { initialProps: { repository: 'Octo/App' as string | undefined, enabled: true } });
    expect(useCIWatcherStore.getState().subscriptions).toEqual({ 'octo/app': 1 });
    hook.rerender({ repository: 'octo/api', enabled: true });
    expect(useCIWatcherStore.getState().subscriptions).toEqual({ 'octo/api': 1 });
    hook.rerender({ repository: 'octo/api', enabled: false });
    expect(useCIWatcherStore.getState().subscriptions).toEqual({});
    hook.unmount();
    expect(useCIWatcherStore.getState().subscriptions).toEqual({});
  });
});
