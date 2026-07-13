import { describe, expect, it } from 'vitest';
import { analyticsRecordEvents, hasCanonicalAnalyticsRepositories } from './useAnalyticsData';

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
});
