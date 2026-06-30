import { describe, expect, it } from 'vitest';
import { resolveEntityTabTarget } from '../lib/entity-target';
import { canonicalizeSimulatorEvents } from './canonical-event';
import { resolveHistoryNavigationTarget } from './history-navigation';
import { reconstructState } from './simulator-reducer';
import type { SimulatorEvent } from './simulator-types';

function fixtureEvent(input: {
  repositoryId: 'danyalahmed1995/Snow-Devil' | 'danyalahmed1995/EXT';
  subjectType: 'pull_request' | 'issue';
  eventType: 'opened' | 'merged' | 'closed' | 'check_failed';
  title: string;
  actor: string;
  occurredAt: string;
}): SimulatorEvent {
  return {
    id: `${input.repositoryId}:${input.subjectType}:2:${input.eventType}`,
    source: 'cross-repository-fixture',
    occurredAt: input.occurredAt,
    repositoryId: input.repositoryId,
    repositoryName: input.repositoryId.split('/')[1],
    repositoryOwner: input.repositoryId.split('/')[0],
    subjectId: `${input.subjectType}-2`,
    subjectType: input.subjectType,
    subjectNumber: 2,
    subjectTitle: input.title,
    actor: { login: input.actor },
    eventType: input.eventType,
    metadata: { url: `https://github.com/${input.repositoryId}/${input.subjectType === 'pull_request' ? 'pull' : 'issues'}/2` },
    sourceCompleteness: 'complete',
  };
}

describe('same-number cross-repository history fixture', () => {
  it('keeps titles, authors, state, checks, events, and targets repository-qualified', () => {
    const events = canonicalizeSimulatorEvents([
      fixtureEvent({ repositoryId: 'danyalahmed1995/Snow-Devil', subjectType: 'pull_request', eventType: 'opened', title: 'Snow collaboration', actor: 'snow-author', occurredAt: '2026-06-01T00:00:00Z' }),
      fixtureEvent({ repositoryId: 'danyalahmed1995/EXT', subjectType: 'pull_request', eventType: 'opened', title: 'EXT TypeScript update', actor: 'ext-author', occurredAt: '2026-06-02T00:00:00Z' }),
      fixtureEvent({ repositoryId: 'danyalahmed1995/EXT', subjectType: 'pull_request', eventType: 'check_failed', title: 'EXT TypeScript update', actor: 'github-actions', occurredAt: '2026-06-03T00:00:00Z' }),
      fixtureEvent({ repositoryId: 'danyalahmed1995/Snow-Devil', subjectType: 'pull_request', eventType: 'merged', title: 'Snow collaboration', actor: 'snow-merger', occurredAt: '2026-06-04T00:00:00Z' }),
      fixtureEvent({ repositoryId: 'danyalahmed1995/EXT', subjectType: 'issue', eventType: 'opened', title: 'EXT issue two', actor: 'issue-author', occurredAt: '2026-06-05T00:00:00Z' }),
      fixtureEvent({ repositoryId: 'danyalahmed1995/EXT', subjectType: 'issue', eventType: 'closed', title: 'EXT issue two', actor: 'issue-closer', occurredAt: '2026-06-06T00:00:00Z' }),
    ]);
    const state = reconstructState(events, '2026-06-30T00:00:00Z');
    const snow = state.get('pull-request:danyalahmed1995/snow-devil:2');
    const ext = state.get('pull-request:danyalahmed1995/ext:2');
    const issue = state.get('issue:danyalahmed1995/ext:2');

    expect(state).toHaveLength(3);
    expect(snow).toMatchObject({ repositoryId: 'danyalahmed1995/Snow-Devil', title: 'Snow collaboration', author: { login: 'snow-author' }, stage: 'merged', checkState: 'unknown' });
    expect(ext).toMatchObject({ repositoryId: 'danyalahmed1995/EXT', title: 'EXT TypeScript update', author: { login: 'ext-author' }, stage: 'checks', checkState: 'failure' });
    expect(issue).toMatchObject({ repositoryId: 'danyalahmed1995/EXT', title: 'EXT issue two', author: { login: 'issue-author' }, stage: 'closed' });

    const extFailure = events.find(event => event.repositoryId.endsWith('/EXT') && event.eventType === 'check_failed')!;
    expect(resolveHistoryNavigationTarget(extFailure.id, events, [...state.values()])?.entity?.id).toBe(ext?.id);
    expect(resolveEntityTabTarget({ ...ext!, url: snow!.url }, 'live')?.url).toBe('https://github.com/danyalahmed1995/ext/pull/2');
    expect(resolveEntityTabTarget(issue, 'live')?.url).toBe('https://github.com/danyalahmed1995/EXT/issues/2');
  });
});
