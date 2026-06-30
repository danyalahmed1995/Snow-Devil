import { describe, expect, it } from 'vitest';
import { ciPollingInterval, ciRetryDelay, ciRunTransitions, isWorkflowRunsPage, normalizeWorkflowRuns } from './ci-watcher';

const body = (repository: string, status = 'completed', conclusion: string | null = 'success') => ({ workflow_runs: [{ id: 2, name: `${repository} CI`, run_number: 7, status, conclusion, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:01:00Z', html_url: `https://github.com/${repository}/actions/runs/2`, run_attempt: 1 }] });

describe('CI Watcher normalization', () => {
  it('distinguishes a valid empty Actions page from a malformed refresh', () => {
    expect(isWorkflowRunsPage({ workflow_runs: [] })).toBe(true);
    expect(isWorkflowRunsPage({ workflow_runs: null })).toBe(false);
  });
  it('keeps same run IDs in different repositories separate', () => {
    const snow = normalizeWorkflowRuns('danyalahmed1995/Snow-Devil', body('danyalahmed1995/Snow-Devil'))[0];
    const ext = normalizeWorkflowRuns('danyalahmed1995/EXT', body('danyalahmed1995/EXT'))[0];
    expect(snow.id).not.toBe(ext.id);
    expect(snow.url).toContain('/danyalahmed1995/Snow-Devil/actions/runs/2');
    expect(ext.url).toContain('/danyalahmed1995/EXT/actions/runs/2');
  });
  it('uses adaptive polling and detects status transitions once', () => {
    const queued = normalizeWorkflowRuns('octo/app', body('octo/app', 'queued', null));
    const running = normalizeWorkflowRuns('octo/app', body('octo/app', 'in_progress', null));
    expect(ciPollingInterval(queued)).toBe(30_000);
    expect(ciPollingInterval(normalizeWorkflowRuns('octo/app', body('octo/app')))).toBe(180_000);
    expect(ciRunTransitions(queued, running)).toHaveLength(1);
    expect(ciRunTransitions(running, running)).toHaveLength(0);
  });
  it('backs off repeated retryable failures with a bounded delay', () => {
    expect(ciRetryDelay(0)).toBe(60_000);
    expect(ciRetryDelay(1)).toBe(120_000);
    expect(ciRetryDelay(8)).toBe(15 * 60_000);
  });
  it('reconstructs a canonical run URL when API URL identity is mismatched', () => {
    const value = body('other/repo');
    expect(normalizeWorkflowRuns('octo/app', value)[0].url).toBe('https://github.com/octo/app/actions/runs/2');
  });
});
