import { describe, expect, it } from 'vitest';
import type { SimulatorEvent } from './simulator-types';
import { buildHistoricalSnapshot, cumulativeProgress, eventsAtDate } from './history-snapshot';

const event = (id: string, occurredAt: string, eventType: SimulatorEvent['eventType'], overrides: Partial<SimulatorEvent> = {}): SimulatorEvent => ({
  id,
  source: 'fixture',
  occurredAt,
  repositoryId: 'acme/app',
  repositoryName: 'app',
  repositoryOwner: 'acme',
  subjectId: 'pr-1',
  subjectType: 'pull_request',
  subjectNumber: 1,
  subjectTitle: 'History fixture',
  eventType,
  metadata: {},
  sourceCompleteness: 'complete',
  ...overrides,
});

describe('historical snapshots', () => {
  const events = [
    event('open', '2026-05-01T10:00:00Z', 'opened'),
    event('review', '2026-05-03T10:00:00Z', 'review_requested'),
    event('merge', '2026-05-10T10:00:00Z', 'merged'),
  ];

  it('selects the latest supported state on or before the date without future leakage', () => {
    const beforeMerge = buildHistoricalSnapshot(events, '2026-05-05T00:00:00Z', '2026-05-12T00:00:00Z');
    expect(beforeMerge.entities[0].stage).toBe('review');
    expect(beforeMerge.progress.pullRequestsMerged).toBe(0);
    const afterMerge = buildHistoricalSnapshot(events, '2026-05-12T00:00:00Z', '2026-05-12T00:00:00Z');
    expect(afterMerge.entities[0].stage).toBe('merged');
    expect(afterMerge.progress.pullRequestsMerged).toBe(1);
  });

  it('keeps a baseline entity and relabels it as existing at history start', () => {
    const baseline = event('baseline', '2026-05-01T00:00:00Z', 'opened', { metadata: { baseline: true, actualCreatedAt: '2026-01-01T00:00:00Z' }, sourceCompleteness: 'partial' });
    const snapshot = buildHistoricalSnapshot([baseline], '2026-05-02T00:00:00Z', '2026-05-10T00:00:00Z');
    expect(snapshot.entities[0]).toMatchObject({ baselineAtReplayStart: true, baselineLabel: 'Existing at history start', createdAt: '2026-01-01T00:00:00Z' });
    expect(snapshot.confidence).toBe('partial');
  });

  it('uses authoritative current transitions only at the latest date', () => {
    const current = event('current', '2026-05-10T00:00:00Z', 'changes_requested', { source: 'github-current-state', metadata: { nativeOrDerived: 'current_snapshot' } });
    expect(buildHistoricalSnapshot([events[0], current], '2026-05-05T00:00:00Z', '2026-05-10T00:00:00Z').entities[0].reviewState).toBe('none');
    expect(buildHistoricalSnapshot([events[0], current], '2026-05-10T00:00:00Z', '2026-05-10T00:00:00Z').entities[0].reviewState).toBe('changes_requested');
  });

  it('suppresses duplicate semantic evidence before cumulative counts', () => {
    const duplicate = { ...events[1], id: 'other-source', source: 'other' };
    const selected = eventsAtDate([...events, duplicate], '2026-05-12T00:00:00Z', '2026-05-12T00:00:00Z');
    expect(selected.events).toHaveLength(3);
    expect(selected.suppressed).toBe(1);
    expect(cumulativeProgress(selected.events)).toMatchObject({ pullRequestsOpened: 1, pullRequestsMerged: 1, reviewsSubmitted: 0, recordedEvents: 3 });
  });

  it('counts issue closures and repository contribution scope cumulatively', () => {
    const issue = event('issue-close', '2026-05-04T00:00:00Z', 'closed', { repositoryId: 'acme/api', subjectId: 'issue-2', subjectType: 'issue', subjectNumber: 2 });
    expect(cumulativeProgress([...events, issue])).toMatchObject({ issuesOpened: 0, issuesWorked: 1, issuesClosed: 1, repositoriesContributedTo: 2 });
  });
});
