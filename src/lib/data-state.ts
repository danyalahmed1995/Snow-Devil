export type DataViewState = 'idle' | 'initial-loading' | 'refreshing-with-snapshot' | 'loaded' | 'partial' | 'empty' | 'failed';

export function resolveDataViewState({ started = true, loading = false, fetching = false, hasSnapshot = false, empty = false, partial = false, error = false }: {
  started?: boolean;
  loading?: boolean;
  fetching?: boolean;
  hasSnapshot?: boolean;
  empty?: boolean;
  partial?: boolean;
  error?: boolean;
}): DataViewState {
  if (!started) return 'idle';
  if ((loading || fetching) && !hasSnapshot) return 'initial-loading';
  if (error && !hasSnapshot) return 'failed';
  if (fetching && hasSnapshot) return 'refreshing-with-snapshot';
  if (partial && hasSnapshot) return 'partial';
  if (empty && hasSnapshot) return 'empty';
  return hasSnapshot ? 'loaded' : error ? 'failed' : 'initial-loading';
}

export function loadingMotionClass(reducedMotion: boolean): string {
  return reducedMotion ? 'is-static-loading' : 'is-animated-loading';
}
