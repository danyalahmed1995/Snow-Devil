import { describe, expect, it } from 'vitest';
import { inventoryItems, throughputBuckets } from './selectors';
import type { AnalyticsDataset, DeliveryEntity } from './types';
import { DEFAULT_ANALYTICS_SETTINGS } from '../stores/analytics-settings-store';

const baseEntity: DeliveryEntity = {
  id: 'pr-1',
  repositoryId: 'octo/app',
  type: 'pull_request',
  number: 1,
  title: 'Fix delivery',
  stage: 'checks',
  state: 'open',
  author: 'ada',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-10T00:00:00Z',
  branchName: 'fix/delivery',
  checkState: 'success',
  mergeability: 'mergeable',
  sourceCompleteness: 'complete',
};

function dataset(entities: DeliveryEntity[]): AnalyticsDataset {
  const derivedEvents: AnalyticsDataset['events'] = [];
  for (const entity of entities) {
    if (entity.reviewState === 'requested') derivedEvents.push({ id: `${entity.id}:review-requested`, entityId: entity.id, repositoryId: entity.repositoryId, type: 'review_requested', occurredAt: entity.updatedAt, sourceCompleteness: 'complete' });
    else if (entity.reviewState === 'approved') derivedEvents.push({ id: `${entity.id}:approved`, entityId: entity.id, repositoryId: entity.repositoryId, type: 'approved', occurredAt: entity.updatedAt, sourceCompleteness: 'complete' });
    if (entity.checkState === 'failure') derivedEvents.push({ id: `${entity.id}:check-failed`, entityId: entity.id, repositoryId: entity.repositoryId, type: 'check_failed', occurredAt: entity.updatedAt, sourceCompleteness: 'complete', requiredCheck: true });
    else if (entity.checkState === 'success') derivedEvents.push({ id: `${entity.id}:check-succeeded`, entityId: entity.id, repositoryId: entity.repositoryId, type: 'check_succeeded', occurredAt: entity.updatedAt, sourceCompleteness: 'complete', requiredCheck: true });
  }
  return {
    referenceDate: '2026-05-20T00:00:00Z',
    refreshedAt: '2026-05-20T00:00:00Z',
    repositories: [{ id: 'octo/app', nameWithOwner: 'octo/app', defaultBranch: 'main', releaseMatching: false, deploymentMatching: false }],
    entities,
    events: [
      { id: 'failure-1', entityId: 'workflow-1', repositoryId: 'octo/app', type: 'workflow_failed', occurredAt: '2026-05-09T00:00:00Z', sourceCompleteness: 'complete' },
      { id: 'failure-2', entityId: 'workflow-2', repositoryId: 'octo/app', type: 'workflow_failed', occurredAt: '2026-05-10T00:00:00Z', sourceCompleteness: 'complete' },
      { id: 'merge-1', entityId: 'pr-1', repositoryId: 'octo/app', type: 'merged', occurredAt: '2026-05-11T00:00:00Z', sourceCompleteness: 'complete' },
      { id: 'merge-duplicate', entityId: 'pr-1', repositoryId: 'octo/app', type: 'merged', occurredAt: '2026-05-11T00:00:00Z', sourceCompleteness: 'complete' },
      ...derivedEvents,
    ],
    branches: [],
    relationships: [],
    rawWorkflowRuns: [],
    partial: false,
    partialReasons: [],
  };
}

describe('analytics product correctness', () => {
  it('aggregates repeated workflow failures under one unique PR inventory row', () => {
    const workflow = (id: string): DeliveryEntity => ({ ...baseEntity, id, type: 'workflow_run', number: undefined, title: 'CI', checkState: 'failure', evidence: [`${id} failed`] });
    const items = inventoryItems(dataset([baseEntity, workflow('workflow-1'), workflow('workflow-2')]), { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ entityType: 'pull_request', type: 'checks_failing', evidenceCount: 2 });
  });

  it('counts a duplicated completion event only once per unique work item and bucket', () => {
    const buckets = throughputBuckets(dataset([{ ...baseEntity, stage: 'merged', state: 'merged', mergedAt: '2026-05-11T00:00:00Z' }]), 30);
    expect(buckets.reduce((sum, bucket) => sum + bucket.merged, 0)).toBe(1);
  });

  it('resolves an aggregated workflow failure when newer evidence succeeds', () => {
    const failed: DeliveryEntity = { ...baseEntity, id: 'workflow-failed', type: 'workflow_run', number: undefined, title: 'CI', updatedAt: '2026-05-09T00:00:00Z', checkState: 'failure', evidence: ['failed run'] };
    const passed: DeliveryEntity = { ...baseEntity, id: 'workflow-passed', type: 'workflow_run', number: undefined, title: 'CI', updatedAt: '2026-05-12T00:00:00Z', checkState: 'success', evidence: ['successful rerun'] };
    const items = inventoryItems(dataset([{ ...baseEntity, checkState: 'success' }, failed, passed]), { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' });
    expect(items.some(item => item.type === 'checks_failing')).toBe(false);
  });

  it('keeps workflow failures on different branches as separate canonical inventory', () => {
    const workflow = (id: string, branchName: string): DeliveryEntity => ({ ...baseEntity, id, type: 'workflow_run', number: undefined, title: 'CI', branchName, checkState: 'failure', evidence: [`${branchName} failed`] });
    const items = inventoryItems(dataset([workflow('one', 'feature/one'), workflow('two', 'feature/two')]), { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' });
    expect(items).toHaveLength(2);
  });

  it('keeps different workflow identities separate even when both are named CI', () => {
    const workflow = (id: string, workflowId: string): DeliveryEntity => ({ ...baseEntity, id, workflowId, type: 'workflow_run', number: undefined, title: 'CI', branchName: 'main', checkState: 'failure', evidence: [`run ${id}`] });
    const items = inventoryItems(dataset([workflow('run-1', 'workflow-1'), workflow('run-2', 'workflow-2')]), { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' });
    expect(items).toHaveLength(2);
  });

  it('groups run-id changes as evidence under one stable workflow row', () => {
    const workflow = (id: string): DeliveryEntity => ({ ...baseEntity, id, workflowId: 'workflow-1', runId: id, type: 'workflow_run', number: undefined, title: 'CI', branchName: 'main', checkState: 'failure', evidence: [`run ${id}`] });
    const items = inventoryItems(dataset(Array.from({ length: 5 }, (_, index) => workflow(`run-${index + 1}`))), { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' });
    expect(items).toHaveLength(1);
    expect(items[0].evidenceCount).toBe(5);
  });

  it('does not invent deployment inventory when the repository cannot supply deployment evidence', () => {
    const items = inventoryItems(dataset([{ ...baseEntity, stage: 'merged', state: 'merged', mergedAt: '2026-05-11T00:00:00Z' }]), DEFAULT_ANALYTICS_SETTINGS);
    expect(items.some(item => item.type === 'merged_not_deployed')).toBe(false);
  });

  it('requires complete, known checks and approvals before calling a pull request ready', () => {
    const variants = [
      { ...baseEntity, id: 'unknown-checks', checkState: 'unknown' as const, reviewState: 'approved' as const },
      { ...baseEntity, id: 'unknown-review', checkState: 'success' as const, reviewState: 'none' as const },
      { ...baseEntity, id: 'draft', state: 'open', isDraft: true, checkState: 'success' as const, reviewState: 'approved' as const },
      { ...baseEntity, id: 'partial', checkState: 'success' as const, reviewState: 'approved' as const, sourceCompleteness: 'partial' as const },
      { ...baseEntity, id: 'ready', state: 'open', checkState: 'success' as const, reviewState: 'approved' as const, sourceCompleteness: 'complete' as const },
    ];
    const ready = inventoryItems(dataset(variants.map((entity, index) => ({ ...entity, number: index + 10 }))), DEFAULT_ANALYTICS_SETTINGS).filter(item => item.riskCategory === 'ready_to_merge');
    expect(ready.map(item => item.entity.id)).toEqual(['ready']);
  });

  it('only marks explicit, overdue review requests as awaiting review', () => {
    const reviewCases: DeliveryEntity[] = [
      { ...baseEntity, id: 'no-request', reviewState: 'none', requestedReviewers: [] },
      { ...baseEntity, id: 'requested', reviewState: 'requested', requestedReviewers: ['grace'] },
      { ...baseEntity, id: 'request-without-reviewer', reviewState: 'requested', requestedReviewers: [] },
    ];
    const items = inventoryItems(dataset(reviewCases.map((entity, index) => ({ ...entity, number: index + 20 }))), DEFAULT_ANALYTICS_SETTINGS);
    expect(items.filter(item => item.riskCategory === 'awaiting_review').map(item => item.entity.id)).toEqual(['requested']);
  });

  it('uses honest unknown-delivery language when matching exists without conclusive evidence', () => {
    const value = dataset([{ ...baseEntity, stage: 'merged', state: 'merged', mergedAt: '2026-05-11T00:00:00Z' }]);
    value.repositories[0].releaseMatching = true;
    const item = inventoryItems(value, DEFAULT_ANALYTICS_SETTINGS)[0];
    expect(item).toMatchObject({ riskCategory: 'delivery_status_unknown', riskLabel: 'Delivery status unknown' });
    expect(item.inventoryReason.toLowerCase()).not.toContain('not released');
  });

  it('keeps unique inventory stable across 100 repositories and 5,000 normalized items', () => {
    const repositories = Array.from({ length: 100 }, (_, index) => ({
      id: `octo/repo-${index}`,
      nameWithOwner: `octo/repo-${index}`,
      defaultBranch: 'main',
      releaseMatching: false,
      deploymentMatching: false,
    }));
    const entities = repositories.flatMap(repository => Array.from({ length: 50 }, (_, index): DeliveryEntity => ({
      ...baseEntity,
      id: `${repository.id}:pr-${index}`,
      repositoryId: repository.id,
      number: index + 1,
      title: `Delivery item ${index + 1}`,
      checkState: 'failure',
      evidence: ['Required checks failing'],
    })));
    const largeDataset: AnalyticsDataset = {
      referenceDate: '2026-05-20T00:00:00Z',
      refreshedAt: '2026-05-20T00:00:00Z',
      repositories,
      entities,
      events: [],
      branches: [],
      relationships: [],
      rawWorkflowRuns: [],
      partial: false,
      partialReasons: [],
    };

    const items = inventoryItems(largeDataset, DEFAULT_ANALYTICS_SETTINGS);
    expect(items).toHaveLength(5_000);
    expect(new Set(items.map(item => item.id)).size).toBe(5_000);
  });
});
