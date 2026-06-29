import { describe, expect, it } from 'vitest';
import { reconcileLatestAccountState } from './account-reconciliation';
import type { FlowItem } from '../types/flow';
import type { SimulatorEntityState } from './simulator-types';

describe('latest account simulator reconciliation', () => {
  it('reconciles canonical current IDs including an assigned organization issue', () => {
    const flow = [{ id: 'node', repositoryId: 'Sonicallysquad/App', repositoryName: 'Sonicallysquad/App', owner: 'Sonicallysquad', type: 'issue', number: 4, title: 'Onboarding', stage: 'issues', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }] as FlowItem[];
    const simulator = [{ id: 'Sonicallysquad/App:issue-4', repositoryId: 'Sonicallysquad/App', subjectType: 'issue', number: 4, title: 'Onboarding', stage: 'issues', status: 'active', assignees: [], reviewers: [], labels: [], commitCount: 0, commentCount: 0, reviewCommentCount: 0, reviewState: 'none', checkState: 'unknown', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }] as SimulatorEntityState[];
    expect(reconcileLatestAccountState(flow, simulator)).toMatchObject({ reconciled: true, missingFromSimulator: [], simulatorOnly: [] });
  });
});
