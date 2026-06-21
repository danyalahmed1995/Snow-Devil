import { describe, it, expect } from 'vitest';
import { reconstructItemState, parseTimelineEvents } from './flow-replay';
import type { FlowItem } from '../types/flow';

describe('flow-replay', () => {
  it('reconstructs timeline state deterministically', () => {
    const item: FlowItem = {
      id: 'pr-1',
      type: 'pull_request',
      repositoryId: 'repo-1',
      repositoryName: 'test/repo',
      owner: 'test',
      title: 'Fix issue',
      stage: 'pull_requests',
      status: 'idle',
      createdAt: '2026-06-20T00:00:00Z',
      updatedAt: '2026-06-20T00:00:00Z',
      reviewSummary: { state: 'NONE', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };

    const rawNodes = [
      {
        __typename: 'ReviewRequestedEvent',
        createdAt: '2026-06-20T01:00:00Z',
        actor: { login: 'user1' }
      },
      {
        __typename: 'PullRequestReview',
        submittedAt: '2026-06-20T02:00:00Z',
        state: 'CHANGES_REQUESTED',
        author: { login: 'user2' }
      },
      {
        __typename: 'PullRequestCommit',
        commit: {
          committedDate: '2026-06-20T03:00:00Z',
          checkSuites: {
            nodes: [
              { status: 'COMPLETED', conclusion: 'FAILURE', updatedAt: '2026-06-20T03:10:00Z' }
            ]
          }
        }
      }
    ];

    const events = parseTimelineEvents('pr-1', 'repo-1', rawNodes);
    expect(events.length).toBe(4);

    // Time 0: Idle PR
    let state = reconstructItemState(item, events, new Date('2026-06-20T00:30:00Z').getTime());
    expect(state.stage).toBe('pull_requests');

    // Time 1: Review Requested
    state = reconstructItemState(item, events, new Date('2026-06-20T01:30:00Z').getTime());
    expect(state.stage).toBe('review');
    expect(state.reviewSummary?.state).toBe('REVIEW_REQUIRED');

    // Time 2: Changes Requested
    state = reconstructItemState(item, events, new Date('2026-06-20T02:30:00Z').getTime());
    expect(state.stage).toBe('review');
    expect(state.status).toBe('changes_requested');
    expect(state.reviewSummary?.state).toBe('CHANGES_REQUESTED');

    // Time 3: Failing checks
    state = reconstructItemState(item, events, new Date('2026-06-20T03:30:00Z').getTime());
    // Precedence: Checks > Review, so if failing checks, it should be in Checks!
    expect(state.stage).toBe('checks');
    expect(state.status).toBe('failing');
    expect(state.checksSummary?.state).toBe('FAILURE');
  });
  it('traverses full lifecycle to merged', () => {
    const item: FlowItem = {
      id: 'pr-2',
      type: 'pull_request',
      repositoryId: 'repo-1',
      repositoryName: 'test/repo',
      owner: 'test',
      title: 'Lifecycle',
      stage: 'pull_requests',
      status: 'idle',
      createdAt: '2026-06-20T00:00:00Z',
      updatedAt: '2026-06-20T00:00:00Z',
      reviewSummary: { state: 'NONE', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };
    // Let's provide raw nodes that parseTimelineEvents understands
    const realRawNodes = [
      { __typename: 'ReviewRequestedEvent', createdAt: '2026-06-20T01:00:00Z' },
      { __typename: 'PullRequestReview', submittedAt: '2026-06-20T02:00:00Z', state: 'APPROVED' },
      {
        __typename: 'PullRequestCommit',
        commit: {
          committedDate: '2026-06-20T03:00:00Z',
          checkSuites: { 
            nodes: [
              { status: 'IN_PROGRESS', conclusion: null, updatedAt: '2026-06-20T03:05:00Z' },
              { status: 'COMPLETED', conclusion: 'SUCCESS', updatedAt: '2026-06-20T04:00:00Z' }
            ] 
          }
        }
      },
      { __typename: 'MergedEvent', createdAt: '2026-06-20T05:00:00Z' }
    ];

    const events = parseTimelineEvents('pr-2', 'repo-1', realRawNodes);

    // After review requested
    let state = reconstructItemState(item, events, new Date('2026-06-20T01:30:00Z').getTime());
    expect(state.stage).toBe('review');

    // After approval
    state = reconstructItemState(item, events, new Date('2026-06-20T02:30:00Z').getTime());
    expect(state.stage).toBe('ready'); // Approved, no checks yet (MISSING) maps to Ready

    // After commit but before check completion
    state = reconstructItemState(item, events, new Date('2026-06-20T03:30:00Z').getTime());
    expect(state.stage).toBe('checks'); // Pending check suite creates a 'active' check

    // After successful check completion
    state = reconstructItemState(item, events, new Date('2026-06-20T04:30:00Z').getTime());
    expect(state.stage).toBe('ready'); // Approved + Checks passing

    // After merge
    state = reconstructItemState(item, events, new Date('2026-06-20T05:30:00Z').getTime());
    expect(state.stage).toBe('merged');
  });

  it('handles historical PRs merged before rangeStart', () => {
    // Current live item
    const item: FlowItem = {
      id: 'pr-3',
      type: 'pull_request',
      repositoryId: 'repo-1',
      repositoryName: 'test/repo',
      owner: 'test',
      title: 'Historical Merged',
      stage: 'merged', // Live state
      status: 'merged',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-05T00:00:00Z',
      mergedAt: '2026-01-05T00:00:00Z',
      reviewSummary: { state: 'APPROVED', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'SUCCESS', totalCount: 1, successCount: 1, failureCount: 0 }
    };
    
    // Simulate pagination cap missing the old MergedEvent
    const events: any[] = []; 

    // Time is inside range, but we missed events.
    const cursorTime = new Date('2026-05-15T00:00:00Z').getTime();
    
    // reconstructItemState uses buildBaselineState and advanceItemState internally
    const state = reconstructItemState(item, events, cursorTime);
    
    // Because mergedAt is before cursorTime, terminal safeguards should force it to merged
    expect(state.stage).toBe('merged');
    expect(state.status).toBe('merged');
  });

  it('creates correct baseline state omitting playback events', () => {
    const item: FlowItem = {
      id: 'pr-4',
      type: 'pull_request',
      repositoryId: 'repo-1',
      repositoryName: 'test/repo',
      owner: 'test',
      title: 'Baseline Test',
      stage: 'pull_requests',
      status: 'idle',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-05T00:00:00Z',
      reviewSummary: { state: 'NONE', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };

    const rawNodes = [
      { __typename: 'ReviewRequestedEvent', createdAt: '2026-06-02T00:00:00Z' },
      { __typename: 'MergedEvent', createdAt: '2026-06-10T00:00:00Z' }
    ];

    const events = parseTimelineEvents('pr-4', 'repo-1', rawNodes);
    
    const rangeStart = new Date('2026-06-05T00:00:00Z').getTime();
    
    // Baseline state should include the review request but not the merge
    let baseline = reconstructItemState(item, events, rangeStart);
    expect(baseline.stage).toBe('review');
    expect(baseline.status).toBe('active');
    
    // Advancing past the merge should change state
    let state = reconstructItemState(item, events, new Date('2026-06-15T00:00:00Z').getTime());
    expect(state.stage).toBe('merged');
  });

  it('animates releases at publishedAt', () => {
    const item: FlowItem = {
      id: 'rel-1',
      type: 'release',
      repositoryId: 'repo-1',
      repositoryName: 'test/repo',
      owner: 'test',
      title: 'v1.0.0',
      stage: 'released',
      status: 'idle',
      createdAt: '2026-06-20T05:00:00Z',
      updatedAt: '2026-06-20T05:00:00Z',
      publishedAt: '2026-06-20T05:00:00Z',
    } as any;

    const events: any[] = [];
    
    // Before publishedAt, it should be hidden (stage: absent)
    let state = reconstructItemState(item, events, new Date('2026-06-20T04:00:00Z').getTime());
    expect(state.stage).toBe('absent');
    expect(state.status).toBe('idle');

    // After publishedAt, it should be released
    state = reconstructItemState(item, events, new Date('2026-06-20T06:00:00Z').getTime());
    expect(state.stage).toBe('released');
    expect(state.status).toBe('released');
  });
});
