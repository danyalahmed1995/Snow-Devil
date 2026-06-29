import { describe, expect, it } from 'vitest';
import { buildSyncCoverageSummary, normalizeSyncFailure } from './sync-summary';
import { checkRunUnsupportedReason } from './sync';

describe('sync coverage summary', () => {
  it('never reports included or complete repositories above the current accessible set', () => {
    const summary = buildSyncCoverageSummary({ status: 'complete', completed_repositories_json: JSON.stringify(['a', 'b', 'c']), failed_repositories_json: '[]', counts_json: JSON.stringify({ repositories: 5 }), last_successful_at: '2026-01-01', current_stage: null, current_repository: null, continuation_json: null, last_attempted_at: null, retention_start: null, coverage_start: null, coverage_end: null, rate_limit_json: null, error: null, settings_fingerprint: null, account_login: 'viewer' }, 2, 4);
    expect(summary).toMatchObject({ accessibleNow: 2, includedBySettings: 2, eligibleForSync: 2, fullySynchronized: 2, cachedHistorical: 3 });
  });

  it('normalizes validation failures without exposing raw JSON as primary copy', () => {
    expect(normalizeSyncFailure('github_422 { raw: payload }')).toEqual(expect.objectContaining({ code: 'invalid_query', retryable: false }));
  });

  it('retains the previous snapshot counts while a new refresh has not established counts', () => {
    const summary = buildSyncCoverageSummary({ status: 'syncing', completed_repositories_json: JSON.stringify(['a', 'b']), failed_repositories_json: '[]', counts_json: JSON.stringify({ accessible_repositories: 54, included_repositories: 54, repositories: 54 }), last_successful_at: '2026-06-27T06:02:00Z', current_stage: 'checks', current_repository: 'octo/app', continuation_json: JSON.stringify({ currentJob: { completedRepositories: 12, failedRepositories: 0, totalRepositories: 54, normalizedRecords: 300 } }), last_attempted_at: '2026-06-28T00:00:00Z', retention_start: null, coverage_start: null, coverage_end: null, rate_limit_json: null, error: null, settings_fingerprint: null, account_login: 'viewer' }, 0, 0);
    expect(summary).toMatchObject({ state: 'using_previous_snapshot', accessibleNow: 54, includedBySettings: 54, fullySynchronized: 2, currentJob: { completedRepositories: 12, totalRepositories: 54, stage: 'checks' } });
  });

  it('classifies the reproduced empty-repository check source as unsupported', () => {
    expect(checkRunUnsupportedReason({ default_branch: 'main', size: 0 })).toBe('Checks unavailable: empty repository has no commit on its default branch.');
    expect(normalizeSyncFailure('No commit found for SHA: main')).toMatchObject({ code: 'unsupported_empty_repository', retryable: false });
  });
});
