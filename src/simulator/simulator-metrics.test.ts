import { describe, expect, it } from 'vitest';
import { deriveSimulatorMetrics, formatSimulatorDuration } from './simulator-metrics';
import type { SimulatorEntityState } from './simulator-types';

function entity(id: string, stage: SimulatorEntityState['stage'], status: string): SimulatorEntityState {
  return { id, repositoryId: 'octo/app', subjectType: 'pull_request', title: id, stage, status, assignees: [], reviewers: [], labels: [], commitCount: 0, commentCount: 0, reviewCommentCount: 0, reviewState: 'none', checkState: 'unknown', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
}

describe('simulator metric reconciliation', () => {
  it('counts the same active and merged entities rendered by the cursor board', () => {
    const active = entity('pr-2', 'pull_requests', 'active');
    const merged = { ...entity('pr-1', 'merged', 'completed'), mergedAt: '2026-01-03T00:00:00Z' };
    const metrics = deriveSimulatorMetrics([active, merged], [], 2);
    expect(metrics.activePullRequests).toBe(1);
    expect(metrics.mergedPullRequests).toBe(1);
    expect(metrics.partialSources).toBe(2);
  });

  it('formats short and long durations adaptively', () => {
    expect(formatSimulatorDuration(30_000)).toBe('<1m');
    expect(formatSimulatorDuration(18 * 60_000)).toBe('18m');
    expect(formatSimulatorDuration((3 * 60 + 42) * 60_000)).toBe('3h 42m');
    expect(formatSimulatorDuration(28 * 3_600_000)).toBe('1d 4h');
  });
});
