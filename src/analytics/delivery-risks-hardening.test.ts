import { describe, expect, it } from 'vitest';
import { compareDeliveryRiskPriority, deliveryRiskInventoryAnalysis, inventoryItems, resolveCanonicalEntityState } from './selectors';
import { deliveryRiskHiddenBreakdown, deliveryRiskHiddenReason } from './delivery-risk-scope';
import { DEFAULT_DELIVERY_RISK_VIEW } from './delivery-risk-views';
import type { AnalyticsDataset, DeliveryEntity, DeliveryEvent } from './types';
import { DEFAULT_ANALYTICS_SETTINGS } from '../stores/analytics-settings-store';
import { deriveViewerRelationship } from '../lib/product-model';

const referenceDate = '2026-07-01T12:00:00Z';
const settings = { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC', includeBots: true, includeDependabot: true, includeRenovate: true, includeOtherBots: true };

function pr(id: string, update: Partial<DeliveryEntity> = {}): DeliveryEntity {
  return { id, repositoryId: 'octo/app', type: 'pull_request', number: Number(id.replace(/\D/g, '')) || 1, title: id, stage: 'pull_requests', state: 'open', author: 'ada', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z', checkState: 'unknown', reviewState: 'none', mergeability: 'unknown', sourceCompleteness: 'complete', ...update };
}

function event(entity: DeliveryEntity, type: DeliveryEvent['type'], occurredAt: string, update: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return { id: `${entity.id}:${type}:${occurredAt}`, entityId: entity.id, repositoryId: entity.repositoryId, type, occurredAt, sourceCompleteness: 'complete', ...update };
}

function data(entities: DeliveryEntity[], events: DeliveryEvent[] = [], repository: Partial<AnalyticsDataset['repositories'][number]> = {}): AnalyticsDataset {
  return { referenceDate, refreshedAt: referenceDate, repositories: [{ id: 'octo/app', databaseId: 42, nameWithOwner: 'octo/app', defaultBranch: 'main', viewerPermission: 'MAINTAIN', releaseMatching: false, deploymentMatching: false, ...repository }], entities, events, branches: [], relationships: [], partial: false, partialReasons: [], rawWorkflowRuns: [] };
}

describe('Delivery Risks hardening', () => {
  it('uses mutually exclusive primary precedence while preserving secondary signals', () => {
    const item = pr('pr-1', { updatedAt: '2026-04-01T00:00:00Z', checkState: 'failure', reviewState: 'changes_requested', mergeability: 'conflicting', evidence: ['Required checks failing'] });
    const result = inventoryItems(data([item], [event(item, 'check_failed', '2026-05-01T00:00:00Z', { requiredCheck: true }), event(item, 'changes_requested', '2026-05-02T00:00:00Z')]), settings);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ riskCategory: 'blocked', riskReasonCode: 'merge_conflict' });
    expect(result[0].secondaryRisks).toContain('stale');
  });

  it('only elevates an exact downstream failure to Delivery Blocked', () => {
    const exact = pr('pr-2', { mergedAt: '2026-06-20T00:00:00Z', state: 'merged', checkState: 'failure', evidence: ['Required checks failing'] });
    const inferred = pr('pr-3', { mergedAt: '2026-06-20T00:00:00Z', state: 'merged', evidence: ['Deployment failed according to a note'] });
    const result = inventoryItems(data([exact, inferred], [event(exact, 'deployment_failed', '2026-06-21T00:00:00Z')], { deploymentMatching: true }), settings);
    expect(result.find(value => value.entity.id === 'pr-2')?.riskCategory).toBe('delivery_blocked');
    expect(result.find(value => value.entity.id === 'pr-3')?.riskCategory).toBe('delivery_status_unknown');
  });

  it('requires an outstanding timestamped review request past threshold', () => {
    const overdue = pr('pr-4', { reviewState: 'requested', requestedReviewers: ['grace'] });
    const recent = pr('pr-5', { reviewState: 'requested', requestedReviewers: ['grace'], updatedAt: '2026-06-30T00:00:00Z' });
    const missingTimestamp = pr('pr-6', { reviewState: 'requested', requestedReviewers: ['grace'] });
    const draft = pr('pr-7', { reviewState: 'requested', requestedReviewers: ['grace'], isDraft: true });
    const events = [event(overdue, 'review_requested', '2026-06-20T00:00:00Z'), event(recent, 'review_requested', '2026-06-30T00:00:00Z'), event(draft, 'review_requested', '2026-06-20T00:00:00Z')];
    expect(inventoryItems(data([overdue, recent, missingTimestamp, draft], events), settings).filter(item => item.riskCategory === 'awaiting_review').map(item => item.entity.id)).toEqual(['pr-4']);
  });

  it('requires known mergeability as well as checks and approval for Ready to Merge', () => {
    const ready = pr('pr-8', { checkState: 'success', reviewState: 'approved', mergeability: 'mergeable' });
    const unknown = pr('pr-9', { checkState: 'success', reviewState: 'approved' });
    const pending = pr('pr-10', { checkState: 'running', reviewState: 'approved', mergeability: 'mergeable' });
    const draft = pr('pr-11', { checkState: 'success', reviewState: 'approved', mergeability: 'mergeable', isDraft: true });
    const result = inventoryItems(data([ready, unknown, pending, draft]), settings).filter(item => item.riskCategory === 'ready_to_merge');
    expect(result.map(item => item.entity.id)).toEqual(['pr-8']);
  });

  it('uses meaningful activity and rejects invalid or future timestamps', () => {
    const stale = pr('pr-12', { updatedAt: '2026-04-01T00:00:00Z' });
    const active = pr('pr-13', { updatedAt: '2026-04-01T00:00:00Z' });
    const invalid = pr('pr-14', { createdAt: 'bad', updatedAt: '2099-01-01T00:00:00Z' });
    const result = inventoryItems(data([stale, active, invalid], [event(active, 'commented', '2026-06-30T00:00:00Z')]), settings);
    expect(result.find(item => item.entity.id === 'pr-12')?.riskCategory).toBe('stale');
    expect(result.some(item => item.entity.id === 'pr-13')).toBe(false);
    expect(result.some(item => item.entity.id === 'pr-14')).toBe(false);
  });

  it('partitions bots, elevated bot blockers, legacy human work, and informational delivery items', () => {
    const bot = pr('pr-15', { author: 'dependabot[bot]', isBot: true, updatedAt: '2026-04-01T00:00:00Z' });
    const elevated = pr('pr-16', { author: 'renovate[bot]', isBot: true, checkState: 'failure', evidence: ['Required checks failing'] });
    const legacy = pr('pr-17', { updatedAt: '2025-01-01T00:00:00Z' });
    const merged = pr('pr-18', { state: 'merged', mergedAt: '2026-06-20T00:00:00Z' });
    const result = inventoryItems(data([bot, elevated, legacy, merged], [event(elevated, 'check_failed', '2026-06-29T00:00:00Z', { requiredCheck: true })], { releaseMatching: true }), settings);
    expect(result.find(item => item.entity.id === 'pr-15')?.backlog).toBe('bot');
    expect(result.find(item => item.entity.id === 'pr-16')?.backlog).toBe('active');
    expect(result.find(item => item.entity.id === 'pr-17')?.backlog).toBe('legacy');
    expect(result.find(item => item.entity.id === 'pr-18')?.backlog).toBe('informational');
  });

  it('excludes delivery uncertainty without a model or outside retained history', () => {
    const current = pr('pr-19', { state: 'merged', mergedAt: '2026-06-20T00:00:00Z' });
    const old = pr('pr-20', { state: 'merged', mergedAt: '2025-01-01T00:00:00Z' });
    expect(inventoryItems(data([current]), settings)).toHaveLength(0);
    expect(inventoryItems(data([old], [], { releaseMatching: true }), settings)).toHaveLength(0);
  });

  it('sorts by severity, actionability, activity, age, and stable identity', () => {
    const blocked = pr('pr-21', { checkState: 'failure', evidence: ['Required checks failing'], viewerRelationship: deriveViewerRelationship({ viewerLogin: 'ada', authorLogin: 'ada', baseRepository: { nameWithOwner: 'octo/app', viewerPermission: 'MAINTAIN' } }) });
    const ready = pr('pr-22', { checkState: 'success', reviewState: 'approved', mergeability: 'mergeable' });
    const values = inventoryItems(data([ready, blocked], [event(blocked, 'check_failed', '2026-06-30T00:00:00Z', { requiredCheck: true })]), settings);
    expect([...values].sort(compareDeliveryRiskPriority).map(item => item.entity.id)).toEqual(['pr-21', 'pr-22']);
  });

  it('deduplicates renamed repository records by numeric repository identity', () => {
    const first = pr('old', { repositoryId: 'octo/old', number: 33, checkState: 'failure', evidence: ['Required checks failing'] });
    const second = pr('new', { repositoryId: 'octo/new', number: 33, checkState: 'failure', updatedAt: '2026-06-21T00:00:00Z', evidence: ['Required checks failing'] });
    const value = data([first, second], [event(first, 'check_failed', '2026-06-20T00:00:00Z', { requiredCheck: true }), event(second, 'check_failed', '2026-06-21T00:00:00Z', { requiredCheck: true })]);
    value.repositories = [{ ...value.repositories[0], id: 'octo/old', nameWithOwner: 'octo/old', databaseId: 99 }, { ...value.repositories[0], id: 'octo/new', nameWithOwner: 'octo/new', databaseId: 99 }];
    expect(inventoryItems(value, settings)).toHaveLength(1);
  });

  it('keeps canonical identities stable across 2,000 risks', () => {
    const entities = Array.from({ length: 2_000 }, (_, index) => pr(`pr-${index + 100}`, { number: index + 100, checkState: 'failure', evidence: ['Required checks failing'] }));
    const result = inventoryItems(data(entities), settings);
    expect(result).toHaveLength(2_000);
    expect(new Set(result.map(item => item.id)).size).toBe(2_000);
  });

  it('gates closed and merged pull requests before historical blocker classification', () => {
    const closed = pr('pr-300', { state: 'closed', stage: 'closed', closedAt: '2026-06-30T00:00:00Z', mergeability: 'conflicting', checkState: 'failure', evidence: ['Merge conflict', 'Required checks failing'] });
    const merged = pr('pr-301', { state: 'merged', stage: 'merged', mergedAt: '2026-06-30T00:00:00Z', mergeability: 'conflicting', checkState: 'failure', evidence: ['Merge conflict', 'Required checks failing'] });
    const events = [event(closed, 'check_failed', '2026-06-20T00:00:00Z', { requiredCheck: true }), event(closed, 'closed', '2026-06-30T00:00:00Z'), event(merged, 'check_failed', '2026-06-20T00:00:00Z', { requiredCheck: true }), event(merged, 'merged', '2026-06-30T00:00:00Z')];
    const analysis = deliveryRiskInventoryAnalysis(data([closed, merged], events), settings);
    expect(analysis.items).toEqual([]);
    expect(analysis.terminalEntityCount).toBe(2);
  });

  it('allows only delivery-model outcomes for merged work', () => {
    const merged = pr('pr-302', { state: 'merged', stage: 'merged', mergedAt: '2026-06-20T00:00:00Z', mergeability: 'conflicting', checkState: 'failure', evidence: ['Merge conflict'] });
    const result = inventoryItems(data([merged], [event(merged, 'merged', '2026-06-20T00:00:00Z')], { deploymentMatching: true }), settings);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ riskCategory: 'delivery_status_unknown', backlog: 'informational' });
  });

  it('uses current state before lifecycle events and re-evaluates reopened work without obsolete blockers', () => {
    const reopened = pr('pr-303', { state: 'open', closedAt: '2026-06-20T00:00:00Z', mergeability: 'unknown', evidence: ['Merge conflict observed before closure'], updatedAt: '2026-06-25T00:00:00Z' });
    const events = [event(reopened, 'closed', '2026-06-20T00:00:00Z'), event(reopened, 'reopened', '2026-06-25T00:00:00Z')];
    expect(resolveCanonicalEntityState(reopened, events, referenceDate)).toMatchObject({ terminal: false, source: 'current_entity' });
    expect(inventoryItems(data([reopened], events), settings)).toEqual([]);

    const newlyFailing = { ...reopened, checkState: 'failure' as const };
    const currentEvents = [...events, event(newlyFailing, 'check_failed', '2026-06-26T00:00:00Z', { requiredCheck: true })];
    expect(inventoryItems(data([newlyFailing], currentEvents), settings)[0]).toMatchObject({ riskReasonCode: 'required_checks_failing' });
  });

  it('updates draft, review, conflict, and check transitions without duplicate risks', () => {
    const draftConflict = pr('pr-304', { isDraft: true, mergeability: 'conflicting' });
    expect(inventoryItems(data([draftConflict]), settings)[0]).toMatchObject({ riskReasonCode: 'merge_conflict' });

    const ready = pr('pr-304', { isDraft: false, mergeability: 'mergeable', checkState: 'success', reviewState: 'approved', updatedAt: '2026-06-25T00:00:00Z' });
    expect(inventoryItems(data([draftConflict, ready], [event(ready, 'ready_for_review', '2026-06-25T00:00:00Z'), event(ready, 'approved', '2026-06-26T00:00:00Z'), event(ready, 'check_succeeded', '2026-06-26T01:00:00Z')]), settings)).toMatchObject([{ riskCategory: 'ready_to_merge' }]);

    const awaiting = pr('pr-305', { reviewState: 'requested', requestedReviewers: ['grace'] });
    expect(inventoryItems(data([awaiting], [event(awaiting, 'review_requested', '2026-06-20T00:00:00Z')]), settings)[0]).toMatchObject({ riskCategory: 'awaiting_review' });
    const approved = { ...awaiting, reviewState: 'approved' as const, mergeability: 'mergeable' as const, checkState: 'success' as const, updatedAt: '2026-06-27T00:00:00Z' };
    expect(inventoryItems(data([awaiting, approved], [event(awaiting, 'review_requested', '2026-06-20T00:00:00Z'), event(approved, 'approved', '2026-06-27T00:00:00Z')]), settings)[0]).toMatchObject({ riskCategory: 'ready_to_merge' });

    const passing = pr('pr-306', { mergeability: 'mergeable', checkState: 'success', reviewState: 'approved', evidence: ['Required checks failing in an older commit'] });
    expect(inventoryItems(data([passing], [event(passing, 'check_failed', '2026-06-20T00:00:00Z', { requiredCheck: true }), event(passing, 'check_succeeded', '2026-06-28T00:00:00Z')]), settings)[0]).toMatchObject({ riskCategory: 'ready_to_merge' });
  });

  it('assigns every hidden classified risk to one count bucket', () => {
    const active = pr('pr-307', { checkState: 'failure', evidence: ['Required checks failing'] });
    const branch = pr('pr-308', { type: 'branch', number: undefined, branchName: 'old', state: 'active', updatedAt: '2026-04-01T00:00:00Z' });
    const bot = pr('pr-309', { author: 'dependabot[bot]', isBot: true, updatedAt: '2026-04-01T00:00:00Z' });
    const legacy = pr('pr-310', { updatedAt: '2025-01-01T00:00:00Z' });
    const merged = pr('pr-311', { state: 'merged', mergedAt: '2026-06-20T00:00:00Z' });
    const value = data([active, branch, bot, legacy, merged], [event(active, 'check_failed', '2026-06-30T00:00:00Z', { requiredCheck: true })], { releaseMatching: true });
    value.branches = [{ id: 'old', repositoryId: 'octo/app', name: 'old', firstObservedAt: '2026-04-01T00:00:00Z', lastActivityAt: '2026-04-01T00:00:00Z', defaultBranch: false, estimated: false }];
    const analysis = deliveryRiskInventoryAnalysis(value, settings);
    const breakdown = deliveryRiskHiddenBreakdown(analysis.items, DEFAULT_DELIVERY_RISK_VIEW, settings, () => false, { ignoreCategory: true });
    const visible = analysis.items.filter(item => !deliveryRiskHiddenReason(item, DEFAULT_DELIVERY_RISK_VIEW, settings, () => false, { ignoreCategory: true }));
    expect(visible.map(item => item.entity.id)).toEqual(['pr-307']);
    expect(breakdown).toMatchObject({ entity_type: 1, bot_policy: 1, legacy: 1, delivery_informational: 1 });
    expect(visible.length + Object.values(breakdown).reduce((sum, count) => sum + (count ?? 0), 0)).toBe(analysis.classifiedRiskCount);
  });
});
