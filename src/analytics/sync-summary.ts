import type { AnalyticsSyncContinuation, AnalyticsSyncState } from './sync';

const arrayLength = (value?: string) => {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; }
};

const counts = (value?: string): Record<string, number> => {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

export interface SyncCoverageSummary {
  state: 'idle' | 'refreshing' | 'complete' | 'partial' | 'failed' | 'cancelled' | 'using_previous_snapshot';
  accessibleNow: number;
  includedBySettings: number;
  eligibleForSync: number;
  fullySynchronized: number;
  cachedHistorical: number;
  failed: number;
  skippedOrUnsupported: number;
  explanation: string;
  snapshotId?: string;
  snapshotCompletedAt?: string;
  currentJob?: NonNullable<AnalyticsSyncContinuation['currentJob']> & { stage?: string; repository?: string };
  unsupportedSources: NonNullable<AnalyticsSyncContinuation['unsupportedSources']>;
}

function continuation(value?: string | null): AnalyticsSyncContinuation {
  try { const parsed: unknown = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed as AnalyticsSyncContinuation : {}; } catch { return {}; }
}

export function buildSyncCoverageSummary(sync: AnalyticsSyncState | null, accessibleNow: number, includedBySettings: number): SyncCoverageSummary {
  const rawCounts = counts(sync?.counts_json);
  const failed = arrayLength(sync?.failed_repositories_json);
  const complete = arrayLength(sync?.completed_repositories_json);
  const cachedRepositories = rawCounts.repositories ?? 0;
  const snapshotAccessible = rawCounts.accessible_repositories ?? cachedRepositories;
  const effectiveAccessible = accessibleNow > 0 ? accessibleNow : snapshotAccessible;
  const effectiveIncluded = includedBySettings > 0 ? includedBySettings : rawCounts.included_repositories ?? cachedRepositories;
  const included = Math.min(effectiveAccessible, Math.max(0, effectiveIncluded));
  const eligible = included;
  const state: SyncCoverageSummary['state'] = !sync ? 'idle'
    : sync.status === 'syncing' && sync.last_successful_at ? 'using_previous_snapshot'
    : sync.status === 'syncing' ? 'refreshing'
    : sync.status === 'complete' ? 'complete'
    : sync.status === 'partial' ? 'partial'
    : sync.status === 'cancelled' ? 'cancelled'
    : 'failed';
  const explanation = state === 'using_previous_snapshot' ? 'Refreshing now; the last successful snapshot remains visible.'
    : state === 'partial' ? `Current data loaded with ${failed} failed source${failed === 1 ? '' : 's'}; historical analytics may be biased.`
    : state === 'failed' ? 'The latest synchronization failed; previously cached data may still be visible.'
    : state === 'complete' ? 'The latest eligible repository set synchronized successfully.'
    : state === 'refreshing' ? 'Loading the first synchronized snapshot.'
    : state === 'cancelled' ? 'The last synchronization was cancelled.'
    : 'No synchronization has completed yet.';
  const metadata = continuation(sync?.continuation_json);
  return { state, accessibleNow: effectiveAccessible, includedBySettings: included, eligibleForSync: eligible, fullySynchronized: Math.min(complete, eligible), cachedHistorical: accessibleNow > 0 ? Math.max(0, cachedRepositories - accessibleNow) : cachedRepositories, failed, skippedOrUnsupported: (rawCounts.skipped_repositories ?? 0) + (rawCounts.release_unsupported ?? 0) + (rawCounts.deployment_unsupported ?? 0) + (rawCounts.check_run_unsupported ?? 0), explanation, snapshotId: sync?.last_successful_at ? `${sync.account_login}:${sync.last_successful_at}` : undefined, snapshotCompletedAt: sync?.last_successful_at ?? undefined, currentJob: metadata.currentJob ? { ...metadata.currentJob, stage: sync?.current_stage ?? undefined, repository: sync?.current_repository ?? undefined } : undefined, unsupportedSources: metadata.unsupportedSources ?? [] };
}

export function normalizeSyncFailure(error: string): { code: string; message: string; retryable: boolean } {
  const value = error.toLowerCase();
  if (value.includes('no commit found') || value.includes('empty repository')) return { code: 'unsupported_empty_repository', message: 'Checks are unavailable because the repository has no commit on its default branch.', retryable: false };
  if (value.includes('422')) return { code: 'invalid_query', message: 'GitHub rejected a validation query. The deterministic source will not be retried until repository state changes.', retryable: false };
  if (value.includes('rate_limited') || value.includes('rate limit') || value.includes('403')) return { code: 'rate_limited', message: 'GitHub rate limit reached. The previous snapshot remains available until the reset time.', retryable: true };
  if (value.includes('401') || value.includes('authentication')) return { code: 'authentication_expired', message: 'GitHub authentication expired. Reconnect the account.', retryable: false };
  if (value.includes('404')) return { code: 'repository_unavailable', message: 'A repository was deleted, renamed, or is no longer accessible.', retryable: false };
  if (value.includes('network') || value.includes('offline') || value.includes('fetch')) return { code: 'network', message: 'GitHub is currently unreachable. Cached data remains available.', retryable: true };
  return { code: 'unknown', message: 'Synchronization failed. Export diagnostics for the normalized source summary.', retryable: true };
}
