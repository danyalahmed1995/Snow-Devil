import { describe, expect, it } from 'vitest';
import { calculateCommitTopology, filterCommitNodes } from './topology';
import type { CommitGraphNode } from './types';

const node = (sha: string, parents: string[], message = sha): CommitGraphNode => ({ sha, shortSha: sha, message, author: { name: 'Ada', date: '2026-01-01T00:00:00Z' }, parentShas: parents, branchRefs: [], tagRefs: [], ciState: 'unknown' });

describe('commit topology', () => {
  it('keeps a linear history in one stable lane', () => {
    expect(calculateCommitTopology([node('c', ['b']), node('b', ['a']), node('a', [])]).map(row => row.lane)).toEqual([0, 0, 0]);
  });

  it('assigns a merge parent to a distinct lane and converges by identity', () => {
    const rows = calculateCommitTopology([node('m', ['a', 'b']), node('a', ['r']), node('b', ['r']), node('r', [])]);
    expect(rows[0].edges).toEqual([{ from: 0, to: 0, parentSha: 'a' }, { from: 0, to: 1, parentSha: 'b' }]);
    expect(rows[2].lane).toBe(1);
    expect(rows[2].edges[0].parentSha).toBe('r');
  });

  it('filters by message, sha, author, merge, and CI without mutating nodes', () => {
    const nodes = [node('abcdef', ['base', 'side'], 'Merge feature'), { ...node('123456', ['base'], 'Fix docs'), ciState: 'failing' as const }];
    expect(filterCommitNodes(nodes, { search: 'abc', author: '', filePath: '', mergesOnly: false, pullRequestsOnly: false, failingCiOnly: false })).toEqual([nodes[0]]);
    expect(filterCommitNodes(nodes, { search: '', author: '', filePath: '', mergesOnly: false, pullRequestsOnly: false, failingCiOnly: true })).toEqual([nodes[1]]);
    expect(nodes).toHaveLength(2);
  });
});
