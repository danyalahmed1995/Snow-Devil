import { beforeEach, describe, expect, it } from 'vitest';
import { useCIWatcherStore } from './ci-watcher-store';

beforeEach(() => useCIWatcherStore.setState({ activeAccount: undefined, runsByRepository: {}, repositoryState: {}, subscriptions: {} }));

describe('CI watcher account and repository isolation', () => {
  it('clears account-bound runs and transient subscriptions on account switch', () => {
    useCIWatcherStore.setState({ activeAccount: 'first', runsByRepository: { 'octo/app': [] }, subscriptions: { 'octo/app': 1 } });
    useCIWatcherStore.getState().setActiveAccount('second');
    expect(useCIWatcherStore.getState()).toMatchObject({ activeAccount: 'second', runsByRepository: {}, subscriptions: {} });
  });
  it('reference-counts one shared scheduler subscription per repository', () => {
    useCIWatcherStore.getState().subscribe('Octo/App');
    useCIWatcherStore.getState().subscribe('octo/app');
    expect(useCIWatcherStore.getState().subscriptions['octo/app']).toBe(2);
    useCIWatcherStore.getState().unsubscribe('octo/app');
    expect(useCIWatcherStore.getState().subscriptions['octo/app']).toBe(1);
  });
});
