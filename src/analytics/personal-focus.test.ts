import { describe, expect, it } from 'vitest';
import { distinctReason, partitionCanonicalResponsibilities, type ResponsibilityCandidate } from './personal-focus';

const relationship: ResponsibilityCandidate['relationship'] = { flags: ['assigned_to_viewer'], primary: 'assigned_to_viewer', label: 'Assigned to you', explanation: 'Assigned to you.', directResponsibility: true, actorClassification: 'human', confidence: 'exact' };
const item = (id: string, overrides: Partial<ResponsibilityCandidate> = {}): ResponsibilityCandidate => ({
  entity: { id, author: 'viewer', updatedAt: '2026-06-01T00:00:00Z' },
  activity: 'active',
  relationship,
  attention: { needsAttention: false, reasons: [] },
  ...overrides,
});

describe('personal focus reconciliation', () => {
  it('defines active responsibility as the exclusive visible section union', () => {
    const result = partitionCanonicalResponsibilities([
      item('action', { attention: { needsAttention: true, reasons: ['assigned_to_you'] } }),
      item('waiting', { entity: { id: 'waiting', author: 'viewer', updatedAt: '2026-06-01T00:00:00Z', reviewState: 'requested' } }),
      item('stale', { activity: 'stale' }),
      item('casual', { relationship: { ...relationship, directResponsibility: false } }),
      item('duplicate', { activity: 'stale' }),
      item('duplicate', { activity: 'stale' }),
    ], 'viewer', false);
    expect(result.doNow.map(value => value.entity.id)).toEqual(['action']);
    expect(result.waiting.map(value => value.entity.id)).toEqual(['waiting']);
    expect(result.gettingStale.map(value => value.entity.id)).toEqual(['stale', 'duplicate']);
    expect(result.canonical).toHaveLength(4);
  });

  it('deduplicates repeated relationship and action phrasing', () => {
    expect(distinctReason(['Assigned to you. Assigned to you.', 'Current response required'])).toBe('Assigned to you · Current response required');
  });

  it('keeps healthy active direct work visible instead of dropping it from every section', () => {
    const result = partitionCanonicalResponsibilities([item('healthy-active')], 'viewer', false);
    expect(result.doNow.map(value => value.entity.id)).toEqual(['healthy-active']);
    expect(result.canonical).toHaveLength(1);
  });
});
