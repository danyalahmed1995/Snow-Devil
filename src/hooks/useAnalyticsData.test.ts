import { describe, expect, it } from 'vitest';
import { analyticsRecordEvents, hasCanonicalAnalyticsRepositories } from './useAnalyticsData';
import { analyticsDatasetFromSimulatorEvents } from '../analytics/live-adapter';
import { inventoryItems } from '../analytics/selectors';
import { DEFAULT_ANALYTICS_SETTINGS } from '../stores/analytics-settings-store';

function row(state: string, update: Record<string, unknown> = {}) {
  return { repository_id: 'octo/app', source_type: 'current_pull_request', source_id: 'pr-1', updated_at: '2026-07-01T00:00:00Z', payload_json: JSON.stringify({ number: 1, title: 'One', state, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', ...update }) };
}

describe('analytics current-state records', () => {
  it('emits authoritative lifecycle events for closed, merged, reopened, and draft pull requests', () => {
    expect(analyticsRecordEvents(row('closed'))[0].eventType).toBe('closed');
    expect(analyticsRecordEvents(row('closed', { merged_at: '2026-07-01T00:00:00Z' }))[0].eventType).toBe('merged');
    expect(analyticsRecordEvents(row('open'))[0].eventType).toBe('reopened');
    expect(analyticsRecordEvents(row('open', { draft: true }))[0].eventType).toBe('converted_to_draft');
  });

  it('emits closed state for a current issue snapshot', () => {
    const issue = { ...row('closed'), source_type: 'current_issue' };
    expect(analyticsRecordEvents(issue)[0].eventType).toBe('closed');
  });

  it('recognizes canonical repository records so legacy SQLite reads can be skipped', () => {
    expect(hasCanonicalAnalyticsRepositories([{ ...row('open'), source_type: 'repository' }])).toBe(true);
    expect(hasCanonicalAnalyticsRepositories([row('open')])).toBe(false);
  });

  it('restores exact PR risk evidence from canonical analytics records', () => {
    const event = { id: 'pr-risk:14', repositoryId: 'octo/app', repositoryName: 'app', repositoryOwner: 'octo', subjectId: 'pull-request:octo/app:14', subjectType: 'pull_request', subjectNumber: 14, subjectTitle: 'Qualification', occurredAt: '2026-07-18T00:00:00Z', eventType: 'reopened', source: 'github-current-state', sourceCompleteness: 'complete', observationOnly: true, metadata: { currentSnapshot: true, reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED', mergeability: 'MERGEABLE', requiredApprovalCount: 1, qualifyingApprovalCount: 0 } };
    const check = { ...event, id: 'pr-risk:14:check', eventType: 'check_succeeded', metadata: { ...event.metadata, checkState: 'SUCCESS' } };
    const events = [event, check].flatMap(value => analyticsRecordEvents({ ...row('open'), source_type: 'risk_event', source_id: value.id, payload_json: JSON.stringify(value) }));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ subjectType: 'pull_request', subjectNumber: 14, metadata: { reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED' } });
    const dataset = analyticsDatasetFromSimulatorEvents(events, [{ id: 'octo/app', name: 'octo/app', viewerPermission: 'ADMIN', ownerLogin: 'octo' }], '2026-07-19T00:00:00Z', 'octo');
    expect(inventoryItems(dataset, DEFAULT_ANALYTICS_SETTINGS)).toMatchObject([{ riskCategory: 'blocked', riskReasonCode: 'required_approval_missing' }]);
  });
});
