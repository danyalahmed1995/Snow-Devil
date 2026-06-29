import { describe, expect, it } from 'vitest';
import type { FlowItem } from '../types/flow';
import { classifyWorkflowItem, filterWorkflowItems, formatTimeInStage, homePreview, normalizeWorkflowItem, recentMerges, recentlyActiveRepositories, stageEntryTimestamp, WORKFLOW_STAGES } from './workflow-presentation';

function item(update: Partial<FlowItem> = {}): FlowItem {
  return { id: 'pr:1', type: 'pull_request', repositoryId: 'repo:one', repositoryName: 'octo/one', owner: 'octo', number: 1, title: 'Ship typed workbench', stage: 'pull_requests', status: 'idle', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z', ...update };
}

describe('shared workflow presentation model', () => {
  it('keeps the canonical nine-stage order', () => {
    expect(WORKFLOW_STAGES.map(stage => stage.id)).toEqual(['issues', 'coding', 'pull_requests', 'review', 'checks', 'ready', 'merged', 'released', 'deployed']);
  });

  it('applies terminal, check, review, draft, and open priority deterministically', () => {
    expect(classifyWorkflowItem(item({ deployedAt: '2026-06-12T00:00:00Z' })).stage).toBe('deployed');
    expect(classifyWorkflowItem(item({ mergedAt: '2026-06-11T00:00:00Z', checksSummary: { state: 'FAILURE', totalCount: 1, successCount: 0, failureCount: 1 } })).stage).toBe('merged');
    expect(classifyWorkflowItem(item({ checksSummary: { state: 'FAILURE', totalCount: 2, successCount: 1, failureCount: 1 }, reviewSummary: { state: 'APPROVED', requestedReviewers: [], reviews: [] } }))).toMatchObject({ stage: 'checks', status: 'failing' });
    expect(classifyWorkflowItem(item({ reviewSummary: { state: 'CHANGES_REQUESTED', requestedReviewers: [], reviews: [] } })).stage).toBe('review');
    expect(classifyWorkflowItem(item({ isDraft: true }))).toMatchObject({ stage: 'coding', status: 'idle' });
    expect(classifyWorkflowItem(item()).stage).toBe('pull_requests');
  });

  it('does not treat closed as merged or missing checks as passing', () => {
    expect(classifyWorkflowItem(item({ status: 'closed' })).stage).toBe('closed');
    const result = classifyWorkflowItem(item({ reviewSummary: { state: 'REVIEW_REQUIRED', requestedReviewers: ['ada'], reviews: [] }, checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 } }));
    expect(result.stage).toBe('review');
    expect(result.reason).toContain('1 requested reviewer');
  });

  it('normalizes identity metadata, bot flags, partial history, and stage entry', () => {
    const normalized = normalizeWorkflowItem(item({ author: { login: 'dependabot[bot]', isBot: true }, isDraft: true }), 'demo');
    expect(normalized.id).toBe('pr:1');
    expect(normalized.isBot).toBe(true);
    expect(normalized.sourceMode).toBe('demo');
    expect(normalized.completeness).toBe('partial');
    expect(normalized.stageReason).toContain('draft');
    expect(normalized.stageEnteredAt).toBeDefined();
  });

  it('chooses the latest matching stage entry and formats time honestly', () => {
    const history = [
      { id: 'a', stage: 'review' as const, label: 'Review requested', occurredAt: '2026-06-01T00:00:00Z' },
      { id: 'b', stage: 'review' as const, label: 'Review requested again', occurredAt: '2026-06-02T00:00:00Z' },
    ];
    expect(stageEntryTimestamp(history, 'review')).toBe('2026-06-02T00:00:00Z');
    expect(formatTimeInStage(item({ stageEnteredAt: '2026-06-02T00:00:00Z' }), new Date('2026-06-04T00:00:00Z').getTime())).toBe('2d in stage');
    expect(formatTimeInStage(item({ stageEnteredAt: undefined, stageHistory: [] }), Number.NaN)).toBe('Stage age unavailable');
  });

  it('combines search, active, stage, and repository filters', () => {
    const values = [item(), item({ id: 'pr:2', repositoryId: 'repo:two', repositoryName: 'octo/two', title: 'Fix checks', stage: 'checks', status: 'failing', labels: [{ name: 'urgent', color: 'f00' }] }), item({ id: 'pr:3', stage: 'merged', status: 'merged', mergedAt: '2026-06-12T00:00:00Z' })];
    expect(filterWorkflowItems(values, { search: 'label:urgent', activeOnly: true })).toHaveLength(1);
    expect(filterWorkflowItems(values, { search: '', activeOnly: false, stage: 'merged' })).toHaveLength(1);
    expect(filterWorkflowItems(values, { search: '', activeOnly: false, repositoryId: 'repo:two' })).toHaveLength(1);
  });

  it('caps Home previews and sorts repository activity and merges by timestamps', () => {
    const values = [item({ id: 'a', stage: 'issues', type: 'issue', updatedAt: '2026-06-01T00:00:00Z' }), item({ id: 'b', stage: 'issues', type: 'issue', updatedAt: '2026-06-02T00:00:00Z' }), item({ id: 'c', stage: 'issues', type: 'issue', updatedAt: '2026-06-03T00:00:00Z' }), item({ id: 'm1', stage: 'merged', status: 'merged', mergedAt: '2026-06-10T00:00:00Z' }), item({ id: 'm2', stage: 'merged', status: 'merged', mergedAt: '2026-06-12T00:00:00Z' })];
    expect(homePreview(values).issues).toHaveLength(2);
    expect(recentlyActiveRepositories(values)[0].lastActivityAt).toBe('2026-06-10T00:00:00Z');
    expect(recentMerges(values).map(value => value.id)).toEqual(['m2', 'm1']);
  });
});
