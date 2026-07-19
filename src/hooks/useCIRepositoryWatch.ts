import { useEffect } from 'react';
import { useCIWatcherStore } from '../stores/ci-watcher-store';

/** Registers a repository as a consumer of the app-owned global CI watcher. */
export function useCIRepositoryWatch(repository: string | undefined, enabled = true) {
  const subscribe = useCIWatcherStore(state => state.subscribe);
  const unsubscribe = useCIWatcherStore(state => state.unsubscribe);
  useEffect(() => {
    if (!enabled || !repository) return;
    subscribe(repository);
    return () => unsubscribe(repository);
  }, [enabled, repository, subscribe, unsubscribe]);
}
