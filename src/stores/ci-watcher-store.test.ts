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

describe('CI watcher run merging', () => {
  it('preserves newer runs when presented with stale api responses', () => {
    const run1: any = { id: 1, status: 'completed', updatedAt: '2026-07-16T12:05:00Z' };
    const run1Stale: any = { id: 1, status: 'in_progress', updatedAt: '2026-07-16T12:00:00Z' };
    
    // Initial load from specific-run watcher is fresh
    useCIWatcherStore.getState().setRuns('octo/app', [run1]);
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].status).toBe('completed');
    
    // Background list poller receives stale response
    useCIWatcherStore.getState().setRuns('octo/app', [run1Stale]);
    
    // Store should intelligently merge and keep the newer completed status
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].status).toBe('completed');
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].updatedAt).toBe('2026-07-16T12:05:00Z');
  });

  it('updates runs when presented with newer api responses', () => {
    const run1: any = { id: 1, status: 'in_progress', updatedAt: '2026-07-16T12:00:00Z' };
    const run1Fresh: any = { id: 1, status: 'completed', updatedAt: '2026-07-16T12:05:00Z' };
    
    useCIWatcherStore.getState().setRuns('octo/app', [run1]);
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].status).toBe('in_progress');
    
    useCIWatcherStore.getState().setRuns('octo/app', [run1Fresh]);
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].status).toBe('completed');
    expect(useCIWatcherStore.getState().runsByRepository['octo/app'][0].updatedAt).toBe('2026-07-16T12:05:00Z');
  });
});
