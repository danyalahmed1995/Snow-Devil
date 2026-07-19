import { describe, expect, it } from 'vitest';
import type { SimulatorEvent } from '../simulator/simulator-types';
import { indexCommitCiSummaries, summarizeWorkflowJobs } from './ci-status';

function run(overrides: Partial<SimulatorEvent> & { metadata?: Record<string, unknown> } = {}): SimulatorEvent {
  return {
    id: 'run-1', source: 'github', occurredAt: '2026-07-19T10:00:00Z', repositoryId: 'Acme/Widget', repositoryName: 'Acme/Widget', repositoryOwner: 'Acme',
    subjectId: '1', subjectType: 'workflow_run', subjectTitle: 'Build', eventType: 'workflow_succeeded', sourceCompleteness: 'complete',
    metadata: { headSha: 'ABC123', workflowId: '10', runId: '100', status: 'completed', conclusion: 'success', ...overrides.metadata },
    ...overrides,
  };
}

describe('commit CI summaries', () => {
  it('isolates workflow runs by repository and commit SHA', () => {
    const summaries = indexCommitCiSummaries([
      run(),
      run({ id: 'other-repo', repositoryId: 'Acme/Other', repositoryName: 'Acme/Other', metadata: { headSha: 'ABC123', workflowId: '20', status: 'completed', conclusion: 'failure' } }),
      run({ id: 'other-sha', metadata: { headSha: 'DEF456', workflowId: '30', status: 'in_progress', conclusion: null } }),
    ], 'acme/widget');
    expect(summaries.get('abc123')).toMatchObject({ state: 'passing', total: 1, passed: 1, failed: 0 });
    expect(summaries.get('def456')).toMatchObject({ state: 'pending', total: 1, pending: 1 });
  });

  it('uses the newest run for each workflow and aggregates failures first', () => {
    const summaries = indexCommitCiSummaries([
      run({ id: 'old-build', occurredAt: '2026-07-19T09:00:00Z', metadata: { headSha: 'ABC123', workflowId: '10', runId: '99', status: 'completed', conclusion: 'failure' } }),
      run({ id: 'new-build', metadata: { headSha: 'ABC123', workflowId: '10', runId: '100', status: 'completed', conclusion: 'success' } }),
      run({ id: 'lint', occurredAt: '2026-07-19T11:00:00Z', subjectTitle: 'Lint', metadata: { headSha: 'ABC123', workflowId: '20', runId: '101', status: 'completed', conclusion: 'failure' } }),
    ], 'acme/widget').get('abc123');
    expect(summaries).toMatchObject({ state: 'failing', total: 2, passed: 1, failed: 1, latestRunId: '101' });
    expect(summaries?.names).toEqual(['Build', 'Lint']);
  });

  it('counts the jobs inside a workflow as checks', () => {
    const summary = summarizeWorkflowJobs([
      { name: 'Rust Quality', status: 'completed', conclusion: 'success' },
      { name: 'Frontend Quality', status: 'completed', conclusion: 'success' },
      { name: 'Windows Tauri Build', status: 'in_progress', conclusion: null },
      { name: 'Playwright E2E', status: 'queued', conclusion: null },
    ]);
    expect(summary).toMatchObject({ state: 'pending', total: 4, passed: 2, failed: 0, pending: 2 });
    expect(summary.names).toEqual(['Frontend Quality', 'Rust Quality', 'Playwright E2E', 'Windows Tauri Build']);
  });
});
