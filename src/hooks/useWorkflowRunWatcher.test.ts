import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearWorkflowRunPersistenceMarkersForTests,
  shouldPersistWorkflowRun,
  type WorkflowRunDetails,
} from './useWorkflowRunWatcher';

function run(overrides: Partial<WorkflowRunDetails> = {}): WorkflowRunDetails {
  return {
    id: 42,
    name: 'CI',
    run_number: 7,
    run_attempt: 1,
    event: 'pull_request',
    status: 'in_progress',
    conclusion: null,
    head_branch: 'feature',
    head_sha: 'abc1234',
    html_url: 'https://github.com/octo/widgets/actions/runs/42',
    created_at: '2026-07-17T10:00:00Z',
    updated_at: '2026-07-17T10:00:05Z',
    run_started_at: '2026-07-17T10:00:01Z',
    repository: { id: 1, full_name: 'octo/widgets' },
    actor: { login: 'octocat', avatar_url: '' },
    pull_requests: [{ number: 4, url: '' }],
    ...overrides,
  };
}

describe('workflow run persistence throttling', () => {
  beforeEach(clearWorkflowRunPersistenceMarkersForTests);

  it('persists the first payload but skips identical polling responses', () => {
    expect(shouldPersistWorkflowRun('octo/widgets', run())).toBe(true);
    expect(shouldPersistWorkflowRun('octo/widgets', run())).toBe(false);
  });

  it('persists status, timestamp, conclusion, and attempt transitions', () => {
    expect(shouldPersistWorkflowRun('octo/widgets', run())).toBe(true);
    expect(shouldPersistWorkflowRun('octo/widgets', run({ updated_at: '2026-07-17T10:00:10Z' }))).toBe(true);
    expect(shouldPersistWorkflowRun('octo/widgets', run({ updated_at: '2026-07-17T10:00:10Z', status: 'completed', conclusion: 'success' }))).toBe(true);
    expect(shouldPersistWorkflowRun('octo/widgets', run({ updated_at: '2026-07-17T10:00:10Z', run_attempt: 2 }))).toBe(true);
  });
});
