import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAccountSimulatorSnapshot } from './account-simulator-loader';
import { fetchAccountActivityWithCoverage, fetchPullRequestRiskSnapshot, fetchRepositoryActivity, type AccountActivitySource } from './simulator-github-api';
import { SimulatorSafeError } from './simulator-errors';
import type { SimulatorEvent } from './simulator-types';

const mockedInvoke = vi.mocked(invoke);

function invokePayload(commandOrPayload: unknown, maybePayload: any) {
  return maybePayload ?? (typeof commandOrPayload === 'object' ? commandOrPayload as any : {});
}

const baseEvent = (id = 'octo/repo:issue-1:opened'): SimulatorEvent => ({
  id,
  source: 'github-graphql',
  occurredAt: '2026-06-01T12:00:00Z',
  repositoryId: 'octo/repo',
  repositoryName: 'repo',
  repositoryOwner: 'octo',
  subjectId: 'octo/repo:issue-1',
  subjectType: 'issue',
  subjectNumber: 1,
  subjectTitle: 'Issue',
  actor: { login: 'octo' },
  eventType: 'opened',
  metadata: { accountLogin: 'octo' },
  inclusionReason: 'authored_by_you',
  sourceCompleteness: 'complete',
});

const source = (id: string, reason: AccountActivitySource['reason'] = 'authored_by_you'): AccountActivitySource => ({
  id,
  label: `${id} source`,
  reason,
  query: login => `${id}:${login}`,
});

function node(update: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'node-1',
    number: 1,
    title: 'Issue',
    url: 'https://github.com/octo/repo/issues/1',
    createdAt: '2026-06-01T12:00:00Z',
    closedAt: null,
    author: { login: 'octo', avatarUrl: '' },
    repository: { nameWithOwner: 'octo/repo', owner: { login: 'octo' }, name: 'repo' },
    timelineItems: { nodes: [] },
    ...update,
  };
}

function page(nodes: unknown[]) {
  return { data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
}

describe('account simulator source collection', () => {
  beforeEach(() => mockedInvoke.mockReset());

  it('loads account history when all account sources succeed', async () => {
    mockedInvoke.mockResolvedValue(page([node()]));
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [source('authored'), source('assigned', 'assigned_to_you')]);
    expect(result.loadedSources).toBe(2);
    expect(result.sourceFailures).toHaveLength(0);
    expect(result.sourceStatuses?.every(status => status.status === 'loaded')).toBe(true);
    expect(result.events.map(event => event.subjectId)).toEqual(['issue:octo/repo:1']);
  });

  it('keeps successful account sources when one source fails', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      const payload = invokePayload(cmd, args);
      if (String(payload.variables?.query).startsWith('assigned:')) throw new Error('network timeout');
      return page([node()]);
    });
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [source('authored'), source('assigned', 'assigned_to_you')]);
    expect(result.loadedSources).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.sourceFailures[0]).toMatchObject({ sourceId: 'assigned', category: 'network' });
  });

  it('records multiple optional source failures while usable history remains', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      const payload = invokePayload(cmd, args);
      const query = String(payload.variables?.query);
      if (query.startsWith('reviewed:') || query.startsWith('commented:')) throw new Error('GitHub rate limit reached');
      return page([node()]);
    });
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [source('authored'), source('reviewed', 'reviewed_by_you'), source('commented', 'commented_on_by_you')]);
    expect(result.loadedSources).toBe(1);
    expect(result.sourceFailures.map(failure => failure.category)).toEqual(['rate_limit', 'rate_limit']);
  });

  it('classifies invalid API payloads', async () => {
    mockedInvoke.mockResolvedValue({ data: { search: null } });
    await expect(fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [source('authored')]))
      .rejects.toMatchObject({ category: 'invalid_response' });
  });

  it('falls back to split issue and pull-request searches when a broad source query is unsupported', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      const query = String(invokePayload(cmd, args).variables?.query);
      if (query === 'author:octo') return { errors: [{ message: 'Unsupported broad query' }] };
      return page([node({ id: query.includes('is:pr') ? 'pr-node' : 'issue-node', number: query.includes('is:pr') ? 2 : 1, mergedAt: query.includes('is:pr') ? null : undefined })]);
    });
    const fallbackSource: AccountActivitySource = {
      ...source('authored'),
      query: login => `author:${login}`,
      fallbackQueries: login => [`is:pr author:${login}`, `is:issue author:${login}`],
    };
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [fallbackSource]);
    expect(result.loadedSources).toBe(1);
    expect(result.sourceFailures).toHaveLength(0);
    expect(result.sourceStatuses?.[0]).toMatchObject({ status: 'loaded', message: expect.stringContaining('split issue and pull-request queries') });
  });

  it('treats malformed source nodes as source-local normalization failures', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => String(invokePayload(cmd, args).variables?.query).startsWith('broken:')
      ? page([node({ repository: null })])
      : page([node()]));
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [source('authored'), source('broken')]);
    expect(result.loadedSources).toBe(1);
    expect(result.sourceFailures[0]).toMatchObject({ sourceId: 'broken', category: 'normalization_failed' });
  });

  it('adds replay-start baselines and applies current assertions only at the latest cursor', async () => {
    mockedInvoke.mockResolvedValue(page([node({ createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-06-30T00:00:00Z', state: 'OPEN', assignees: { nodes: [{ login: 'octo' }] } })]));
    const currentSource = { ...source('current-assigned', 'assigned_to_you'), currentState: true };
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [currentSource]);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'opened', occurredAt: '2026-06-30T00:00:00Z', observedAt: '2026-06-30T00:00:00Z', observationOnly: true, actor: undefined, metadata: expect.objectContaining({ baselineLabel: 'Existing at replay start' }) }),
      expect.objectContaining({ eventType: 'reopened', occurredAt: '2026-06-30T00:00:00Z', source: 'github-current-state' }),
    ]));
    expect(result.events.filter(event => event.occurredAt < '2026-06-30T00:00:00Z').some(event => event.metadata.currentSnapshot)).toBe(false);
  });

  it('includes assigned organization issues without owner filtering', async () => {
    mockedInvoke.mockResolvedValue(page([node({ repository: { nameWithOwner: 'Sonicallysquad/App', owner: { login: 'Sonicallysquad' }, name: 'App' }, state: 'OPEN', assignees: { nodes: [{ login: 'octo' }] } })]));
    const assigned = { ...source('current-assigned-issues', 'assigned_to_you'), currentState: true, query: (login: string) => `is:open is:issue assignee:${login}` };
    const result = await fetchAccountActivityWithCoverage('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', [assigned]);
    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ repositoryId: 'Sonicallysquad/App', inclusionReason: 'assigned_to_you' })]));
  });
});

describe('account simulator loader recovery', () => {
  it('shows cached history when fully offline with a valid cache', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [baseEvent()],
      saveEvents: vi.fn(),
      fetchFresh: async () => { throw new Error('offline network failure'); },
    });
    expect(snapshot.loadState).toBe('ready_partial');
    expect(snapshot.details.cached).toBe(true);
    expect(snapshot.details.refreshError?.category).toBe('network');
    expect(snapshot.events).toHaveLength(1);
  });

  it('fails safely when fully offline without cache', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [],
      saveEvents: vi.fn(),
      fetchFresh: async () => { throw new Error('offline network failure'); },
    });
    expect(snapshot.loadState).toBe('error');
    expect(snapshot.details.refreshError?.category).toBe('network');
  });

  it('classifies authentication failure', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [],
      fetchFresh: async () => { throw new SimulatorSafeError('authentication', 'No token'); },
    });
    expect(snapshot.details.refreshError?.category).toBe('authentication');
  });

  it('classifies rate-limit failure', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [],
      fetchFresh: async () => { throw new SimulatorSafeError('rate_limit', 'rate limit'); },
    });
    expect(snapshot.details.refreshError?.category).toBe('rate_limit');
  });

  it('reports cache schema incompatibility but rebuilds from fresh sources', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => { throw new SyntaxError('JSON parse failed'); },
      saveEvents: vi.fn(),
      fetchFresh: async () => ({ events: [baseEvent()], sourceFailures: [], loadedSources: 1, totalSources: 1 }),
    });
    expect(snapshot.loadState).toBe('ready_complete');
    expect(snapshot.details.cacheError?.category).toBe('cache_incompatible');
  });

  it('constructs replay state with partial data', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [],
      saveEvents: vi.fn(),
      fetchFresh: async () => ({ events: [baseEvent()], sourceFailures: [{ sourceId: 'comments', label: 'Comments', category: 'network', message: 'Network unavailable.', retryable: true, occurredAt: '2026-06-02T00:00:00Z' }], loadedSources: 1, totalSources: 2 }),
    });
    expect(snapshot.loadState).toBe('ready_partial');
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.details.sourceFailures).toHaveLength(1);
  });

  it('classifies replay construction failures', async () => {
    const snapshot = await loadAccountSimulatorSnapshot('octo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', {
      readCache: async () => [],
      saveEvents: vi.fn(),
      fetchFresh: async () => ({ events: [baseEvent()], sourceFailures: [], loadedSources: 1, totalSources: 1 }),
      reconstruct: () => { throw new Error('boom'); },
    });
    expect(snapshot.loadState).toBe('error');
    expect(snapshot.details.refreshError?.category).toBe('replay_construction_failed');
  });
});

describe('repository simulator compatibility', () => {
  beforeEach(() => mockedInvoke.mockReset());

  it('keeps repository simulator loading on the repository-specific path', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      const payload = invokePayload(cmd, args);
      const query = String(payload.query);
      if (query.includes('pullRequests')) {
        return { data: { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'pr1', number: 7, title: 'Fix', createdAt: '2026-06-01T12:00:00Z', mergedAt: null, closedAt: null, author: { login: 'octo', avatarUrl: '' }, timelineItems: { nodes: [] } }] } } } };
      }
      if (query.includes('issues')) return { data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
      if (query.includes('releases')) return { data: { repository: { releases: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
      return page([]);
    });
    const events = await fetchRepositoryActivity('octo', 'repo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z');
    expect(events).toEqual([expect.objectContaining({ repositoryId: 'octo/repo', subjectId: 'pull-request:octo/repo:7', eventType: 'opened' })]);
  });

  it('keeps an older current incoming fork PR despite partial replay history', async () => {
    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      const query = String(invokePayload(cmd, args).query);
      if (query.includes('pullRequests')) return { data: { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'pr2', number: 2, title: 'Incoming work', url: 'https://github.com/octo/repo/pull/2', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-06-27T00:00:00Z', state: 'OPEN', isDraft: false, mergedAt: null, closedAt: null, author: { login: 'contributor', avatarUrl: '' }, baseRefName: 'main', headRefName: 'feature', headRepository: { nameWithOwner: 'contributor/repo', isFork: true, owner: { login: 'contributor' } }, reviewDecision: null, reviewRequests: { nodes: [] }, assignees: { nodes: [] }, commits: { nodes: [] }, timelineItems: { nodes: [] } }] } } } };
      if (query.includes('issues')) return { data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
      if (query.includes('releases')) return { data: { repository: { releases: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
      return page([]);
    });
    const events = await fetchRepositoryActivity('octo', 'repo', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ subjectId: 'pull-request:octo/repo:2', eventType: 'opened', source: 'github-current-state' }),
      expect.objectContaining({ subjectId: 'pull-request:octo/repo:2', eventType: 'reopened', source: 'github-current-state' }),
    ]));
  });

  it('refreshes one PR with stable review source evidence and observation-only policy state', async () => {
    mockedInvoke.mockResolvedValue({ data: { repository: { pullRequest: { id: 'PR_node', number: 56881, title: 'Fix spans', url: 'https://github.com/react/react-native/pull/56881', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-28T23:37:29Z', state: 'OPEN', isDraft: false, headRefOid: 'abc', mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: 'CHANGES_REQUESTED', author: { login: 'pr-author' }, reviewRequests: { nodes: [] }, commits: { nodes: [{ commit: { oid: 'abc', statusCheckRollup: { state: 'SUCCESS' } } }] }, timelineItems: { nodes: [{ __typename: 'PullRequestReview', id: 'PRR_node', databaseId: 77, createdAt: '2026-05-20T15:07:56Z', submittedAt: '2026-05-20T15:07:56Z', updatedAt: '2026-05-20T15:07:56Z', state: 'CHANGES_REQUESTED', author: { login: 'javache' } }] } } } } });
    const events = await fetchPullRequestRiskSnapshot('react/react-native', 56881, '2026-07-06T00:00:00Z');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pull-request:react/react-native:56881:review:PRR_node', occurredAt: '2026-05-20T15:07:56Z', sourceOccurredAt: '2026-05-20T15:07:56Z', actor: { login: 'javache' }, observationOnly: false }),
      expect.objectContaining({ id: 'pull-request:react/react-native:56881:current-open', occurredAt: '2026-05-28T23:37:29Z', observedAt: '2026-07-06T00:00:00Z', actor: undefined, observationOnly: true }),
    ]));
  });

  it('records review-required merge policy independently from successful checks', async () => {
    mockedInvoke.mockResolvedValue({ data: { repository: { pullRequest: { id: 'PR_9', number: 9, title: 'Nine', createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-06T00:17:44Z', state: 'OPEN', isDraft: false, headRefOid: 'head', mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED', reviewRequests: { nodes: [] }, commits: { nodes: [{ commit: { oid: 'head', statusCheckRollup: { state: 'SUCCESS' } } }] }, timelineItems: { nodes: [] } } } } });
    const events = await fetchPullRequestRiskSnapshot('danyalahmed1995/Snow-Devil', 9, '2026-07-06T01:00:00Z');
    expect(events.find(value => value.id.endsWith(':current-open'))?.metadata).toMatchObject({ reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED', mergeability: 'MERGEABLE', requiredApprovalCount: 1, qualifyingApprovalCount: 0, approvalRequirementConfidence: 'partial' });
  });
});
