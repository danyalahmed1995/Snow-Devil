import { describe, expect, it } from 'vitest';
import { canonicalizeSimulatorEvents } from './canonical-event';
import type { SimulatorEvent } from './simulator-types';

const event = (repositoryId: string, subjectType: 'pull_request' | 'issue', number: number): SimulatorEvent => ({
  id: `${subjectType}-${number}:opened`, source: 'fixture', occurredAt: '2026-06-01T00:00:00Z', repositoryId,
  repositoryName: repositoryId.split('/')[1], repositoryOwner: repositoryId.split('/')[0], subjectId: `${subjectType}-${number}`,
  subjectType, subjectNumber: number, subjectTitle: `${repositoryId} ${subjectType} ${number}`, eventType: 'opened', metadata: {}, sourceCompleteness: 'complete',
});

describe('simulator canonical event migration', () => {
  it('separates same-number cross-repository PRs and same-number issue/PR pairs', () => {
    const values = canonicalizeSimulatorEvents([
      event('danyalahmed1995/Snow-Devil', 'pull_request', 2),
      event('danyalahmed1995/EXT', 'pull_request', 2),
      event('danyalahmed1995/EXT', 'issue', 2),
    ]);
    expect(new Set(values.map(value => value.subjectId)).size).toBe(3);
    expect(values.map(value => value.subjectId)).toContain('pull-request:danyalahmed1995/snow-devil:2');
    expect(values.map(value => value.subjectId)).toContain('pull-request:danyalahmed1995/ext:2');
    expect(values.map(value => value.subjectId)).toContain('issue:danyalahmed1995/ext:2');
  });
});

