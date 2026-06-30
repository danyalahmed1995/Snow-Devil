import { describe, expect, it } from 'vitest';
import { defaultHistoryView } from '../stores/history-view-store';
import { historyFilterConflicts, resolveHistoryNavigationTarget } from './history-navigation';
import type { SimulatorEntityState, SimulatorEvent } from './simulator-types';

const entity = (stage: SimulatorEntityState['stage']): SimulatorEntityState => ({ id: 'pull-request:octo/app:2', repositoryId: 'octo/app', subjectType: 'pull_request', title: 'Two', number: 2, stage, status: stage, assignees: [], reviewers: [], labels: [], commitCount: 0, commentCount: 0, reviewCommentCount: 0, reviewState: 'none', checkState: 'unknown', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', sourceCompleteness: 'complete' });
const event: SimulatorEvent = { id: 'event', source: 'fixture', occurredAt: '2026-01-01T00:00:00Z', repositoryId: 'octo/app', repositoryName: 'app', repositoryOwner: 'octo', subjectId: 'pull-request:octo/app:2', subjectType: 'pull_request', subjectNumber: 2, subjectTitle: 'Two', eventType: 'opened', metadata: {}, sourceCompleteness: 'complete' };

describe('history event navigation', () => {
  it('resolves active and completed sections by canonical identity', () => {
    expect(resolveHistoryNavigationTarget('event', [event], [entity('review')])?.section).toBe('active');
    expect(resolveHistoryNavigationTarget('event', [event], [entity('merged')])?.section).toBe('completed');
  });
  it('routes workflow run evidence to the CI column', () => {
    const runEntity = { ...entity('checks'), id: 'workflow-run:octo/app:2', subjectType: 'workflow_run' as const };
    const runEvent = { ...event, id: 'run-event', subjectId: runEntity.id, subjectType: 'workflow_run' as const, eventType: 'workflow_succeeded' as const };
    expect(resolveHistoryNavigationTarget(runEvent.id, [runEvent], [runEntity])).toMatchObject({ entity: { id: runEntity.id }, section: 'ci' });
  });
  it('keeps an evidence-only event selected when no entity snapshot exists', () => {
    expect(resolveHistoryNavigationTarget('event', [event], [])).toMatchObject({ event, entity: undefined, section: undefined });
  });
  it('identifies only conflicting filters', () => {
    const filters = { ...defaultHistoryView('account').filters, repository: 'octo/other', entityType: 'issue' };
    expect(historyFilterConflicts(entity('review'), filters, 'account')).toEqual(['repository', 'entityType']);
  });
});
