import { describe, expect, it } from 'vitest';
import { emptySimulatorLoadDetails } from './account-simulator-loader';
import { summarizeHistoryStatus } from './history-status';

describe('History source completeness and depth wording', () => {
  it('keeps complete source loading distinct from bounded historical depth', () => {
    const summary = summarizeHistoryStatus('ready_complete', { ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, historicalDepth: 'retention_bounded' });
    expect(summary.headline).toBe('History ready · All sources loaded · Limited historical depth');
  });

  it('reports failed source counts without hiding usable partial coverage', () => {
    const summary = summarizeHistoryStatus('ready_partial', { ...emptySimulatorLoadDetails(), loadedSources: 5, totalSources: 8, historicalDepth: 'partial_events', sourceFailures: [{ sourceId: 'authored', label: 'Authored history', category: 'network', message: 'Unavailable', retryable: true, occurredAt: '2026-06-29T00:00:00Z' }] });
    expect(summary.sourceCompleteness).toBe('failed');
    expect(summary.headline).toContain('5 of 8 sources loaded · 1 failed');
    expect(summary.headline).toContain('Partial event history');
  });
});
