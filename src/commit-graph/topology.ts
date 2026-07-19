import type { CommitGraphNode } from './types';

export interface TopologyEdge { from: number; to: number; parentSha: string }
export interface TopologyRow { lane: number; laneCount: number; edges: TopologyEdge[]; lanes: Array<string | undefined> }

function firstFree(lanes: Array<string | undefined>, except = -1): number {
  const index = lanes.findIndex((value, lane) => lane !== except && !value);
  return index < 0 ? lanes.length : index;
}

/** Assigns lanes from newest to oldest using actual parent identities, never timestamps. */
export function calculateCommitTopology(nodes: CommitGraphNode[]): TopologyRow[] {
  const active: Array<string | undefined> = [];
  const rows: TopologyRow[] = [];
  for (const node of nodes) {
    let lane = active.indexOf(node.sha);
    if (lane < 0) lane = firstFree(active);
    active[lane] = node.sha;
    const before = [...active];
    const edges: TopologyEdge[] = [];
    const [firstParent, ...mergeParents] = node.parentShas;
    if (firstParent) {
      const existing = active.indexOf(firstParent);
      const target = existing >= 0 && existing !== lane ? existing : lane;
      edges.push({ from: lane, to: target, parentSha: firstParent });
      active[lane] = target === lane ? firstParent : undefined;
    } else {
      active[lane] = undefined;
    }
    for (const parentSha of mergeParents) {
      let target = active.indexOf(parentSha);
      if (target < 0) {
        target = firstFree(active, lane);
        active[target] = parentSha;
      }
      edges.push({ from: lane, to: target, parentSha });
    }
    while (active.length && !active[active.length - 1]) active.pop();
    rows.push({ lane, laneCount: Math.max(before.length, active.length, lane + 1), edges, lanes: before });
  }
  return rows;
}

export interface CommitGraphFilters {
  search: string;
  author: string;
  filePath: string;
  mergesOnly: boolean;
  pullRequestsOnly: boolean;
  failingCiOnly: boolean;
}

export const DEFAULT_COMMIT_GRAPH_FILTERS: CommitGraphFilters = { search: '', author: '', filePath: '', mergesOnly: false, pullRequestsOnly: false, failingCiOnly: false };

export function filterCommitNodes(nodes: CommitGraphNode[], filters: CommitGraphFilters): CommitGraphNode[] {
  const query = filters.search.trim().toLowerCase();
  const author = filters.author.trim().toLowerCase();
  return nodes.filter(node => {
    if (query && !node.message.toLowerCase().includes(query) && !node.sha.toLowerCase().startsWith(query)) return false;
    if (author && !`${node.author.name} ${node.author.login ?? ''}`.toLowerCase().includes(author)) return false;
    if (filters.mergesOnly && node.parentShas.length < 2) return false;
    if (filters.failingCiOnly && node.ciState !== 'failing') return false;
    return true;
  });
}
