import { invoke } from '@tauri-apps/api/core';
import type { CommitCiState, CommitComparison, CommitGraphDetails, CommitGraphFile, CommitGraphNode, CommitGraphPullRequest } from './types';

interface RestResponse<T> { status: number; body: T; rate_remaining?: number; rate_reset?: number; next_page?: number }

function readableStatus(status: number, response?: RestResponse<unknown>): never {
  if (status === 401) throw new Error('Authentication expired. Reconnect your GitHub account.');
  if (status === 403 && response?.rate_remaining === 0) throw new Error('GitHub rate limit reached. Retry after the reset window.');
  if (status === 403) throw new Error('Repository history is not accessible with the current account.');
  if (status === 404) throw new Error('The repository, branch, or commit no longer exists.');
  throw new Error(`GitHub request failed (${status}).`);
}

async function rest<T>(endpoint: string): Promise<T> {
  const response = await invoke<RestResponse<T>>('analytics_fetch_rest', { endpoint });
  if (response.status >= 400) readableStatus(response.status, response);
  return response.body;
}

function rollupState(value?: string | null): CommitCiState {
  if (value === 'SUCCESS') return 'passing';
  if (value === 'FAILURE' || value === 'ERROR') return 'failing';
  if (value === 'PENDING' || value === 'EXPECTED') return 'pending';
  return 'unknown';
}

interface GraphQlHistoryNode {
  oid: string;
  message: string;
  committedDate: string;
  authoredDate: string;
  author?: { name?: string; email?: string; user?: { login?: string; avatarUrl?: string } };
  committer?: { name?: string; email?: string; user?: { login?: string; avatarUrl?: string } };
  parents?: { nodes?: Array<{ oid: string }> };
  statusCheckRollup?: { state?: string };
  associatedPullRequests?: { nodes?: Array<{ number: number; title: string; state: string; mergedAt?: string; headRefName: string; baseRefName: string }> };
}

type GraphQlPullRequest = NonNullable<NonNullable<GraphQlHistoryNode['associatedPullRequests']>['nodes']>[number];

function pullRequest(value?: GraphQlPullRequest): CommitGraphPullRequest | undefined {
  return value ? { number: value.number, title: value.title, state: value.state, mergedAt: value.mergedAt, headRef: value.headRefName, baseRef: value.baseRefName } : undefined;
}

function graphNode(value: GraphQlHistoryNode, branch: string, first: boolean): CommitGraphNode {
  return {
    sha: value.oid,
    shortSha: value.oid.slice(0, 7),
    message: value.message.split('\n')[0],
    author: { name: value.author?.name ?? value.author?.user?.login ?? 'Unknown author', login: value.author?.user?.login, avatarUrl: value.author?.user?.avatarUrl, email: value.author?.email, date: value.authoredDate },
    committer: { name: value.committer?.name ?? value.committer?.user?.login ?? 'Unknown committer', login: value.committer?.user?.login, avatarUrl: value.committer?.user?.avatarUrl, email: value.committer?.email, date: value.committedDate },
    parentShas: value.parents?.nodes?.map(parent => parent.oid) ?? [],
    branchRefs: first ? [branch] : [],
    tagRefs: [],
    ciState: rollupState(value.statusCheckRollup?.state),
    pullRequest: pullRequest(value.associatedPullRequests?.nodes?.[0]),
  };
}

export interface CommitHistoryPage { nodes: CommitGraphNode[]; cursor?: string; hasMore: boolean }

export async function fetchTagRefs(repository: string): Promise<Array<{ name: string; sha: string }>> {
  const encoded = repository.split('/').map(encodeURIComponent).join('/');
  const values = await rest<Array<{ name: string; commit: { sha: string } }>>(`/repos/${encoded}/tags?per_page=100`);
  return values.map(value => ({ name: value.name, sha: value.commit.sha }));
}

export async function fetchCommitHistory(repository: string, branch: string, cursor?: string, path?: string): Promise<CommitHistoryPage> {
  const [owner, name] = repository.split('/');
  const query = `query($owner:String!,$name:String!,$branch:String!,$cursor:String,$path:String){repository(owner:$owner,name:$name){object(expression:$branch){... on Commit{history(first:50,after:$cursor,path:$path){nodes{oid message committedDate authoredDate author{name email user{login avatarUrl}} committer{name email user{login avatarUrl}} parents(first:8){nodes{oid}} statusCheckRollup{state} associatedPullRequests(first:1){nodes{number title state mergedAt headRefName baseRefName}}}pageInfo{hasNextPage endCursor}}}}}}`;
  const response = await invoke<{ data?: { repository?: { object?: { history?: { nodes?: GraphQlHistoryNode[]; pageInfo?: { hasNextPage: boolean; endCursor?: string } } } } }; errors?: Array<{ message: string }> }>('execute_graphql', { query, variables: { owner, name, branch, cursor: cursor ?? null, path: path?.trim() || null } });
  const history = response.data?.repository?.object?.history;
  if (!history) throw new Error(response.errors?.[0]?.message ?? 'The selected branch has no accessible commit history.');
  return { nodes: (history.nodes ?? []).map((value, index) => graphNode(value, branch, !cursor && index === 0)), cursor: history.pageInfo?.endCursor, hasMore: Boolean(history.pageInfo?.hasNextPage) };
}

const DEMO_NODES: CommitGraphNode[] = [
  { sha: 'd9f73c1a0e42', shortSha: 'd9f73c1', message: 'Polish repository architecture context', author: { name: 'Maya Chen', login: 'maya-snow', date: '2026-02-14T15:20:00Z' }, parentShas: ['a72de900f7b1', 'f31c884221a0'], branchRefs: ['main'], tagRefs: ['v2.4.0'], ciState: 'passing', pullRequest: { number: 148, title: 'Polish repository architecture context', state: 'MERGED', mergedAt: '2026-02-14T15:20:00Z', headRef: 'feat/architecture-context', baseRef: 'main' } },
  { sha: 'a72de900f7b1', shortSha: 'a72de90', message: 'Bound inactive query cache entries', author: { name: 'Noah Williams', login: 'nwilliams', date: '2026-02-14T11:05:00Z' }, parentShas: ['889cf01b619a'], branchRefs: [], tagRefs: [], ciState: 'passing' },
  { sha: 'f31c884221a0', shortSha: 'f31c884', message: 'Add component impact summaries', author: { name: 'Maya Chen', login: 'maya-snow', date: '2026-02-14T09:42:00Z' }, parentShas: ['889cf01b619a'], branchRefs: ['feat/architecture-context'], tagRefs: [], ciState: 'passing', pullRequest: { number: 148, title: 'Polish repository architecture context', state: 'MERGED', headRef: 'feat/architecture-context', baseRef: 'main' } },
  { sha: '889cf01b619a', shortSha: '889cf01', message: 'Restore repository explorer state safely', author: { name: 'Avery Stone', login: 'avery', date: '2026-02-13T18:30:00Z' }, parentShas: ['62ca09d7fa31'], branchRefs: [], tagRefs: [], ciState: 'failing' },
  { sha: '62ca09d7fa31', shortSha: '62ca09d', message: 'Introduce native repository explorer', author: { name: 'Avery Stone', login: 'avery', date: '2026-02-13T10:00:00Z' }, parentShas: [], branchRefs: [], tagRefs: [], ciState: 'passing' },
];

export function demoCommitHistory(branch: string, path?: string): CommitHistoryPage {
  const nodes = path?.trim() ? DEMO_NODES.filter(node => node.sha !== 'a72de900f7b1') : DEMO_NODES;
  return { nodes: nodes.map((node, index) => ({ ...node, branchRefs: index === 0 ? [branch] : node.branchRefs })), hasMore: false };
}

interface RestCommit {
  sha: string;
  commit: { message: string; author?: { name?: string; email?: string; date?: string }; committer?: { name?: string; email?: string; date?: string }; verification?: { verified: boolean; reason: string } };
  author?: { login?: string; avatar_url?: string };
  committer?: { login?: string; avatar_url?: string };
  parents?: Array<{ sha: string }>;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{ filename: string; previous_filename?: string; status: CommitGraphFile['status']; additions: number; deletions: number; changes: number; patch?: string }>;
}

function file(value: NonNullable<RestCommit['files']>[number]): CommitGraphFile { return { filename: value.filename, previousFilename: value.previous_filename, status: value.status, additions: value.additions, deletions: value.deletions, changes: value.changes, patch: value.patch }; }

export async function fetchCommitDetails(repository: string, sha: string): Promise<CommitGraphDetails> {
  const encoded = repository.split('/').map(encodeURIComponent).join('/');
  const commit = await rest<RestCommit>(`/repos/${encoded}/commits/${encodeURIComponent(sha)}`);
  const partialErrors: string[] = [];
  const pulls = await rest<Array<{ number: number; title: string; state: string; merged_at?: string; head: { ref: string }; base: { ref: string } }>>(`/repos/${encoded}/commits/${encodeURIComponent(sha)}/pulls`).catch(() => { partialErrors.push('Pull request association unavailable.'); return []; });
  const summary = { state: 'unknown' as const, total: 0, passed: 0, failed: 0, pending: 0, names: [] };
  const node: CommitGraphNode = { sha: commit.sha, shortSha: commit.sha.slice(0, 7), message: commit.commit.message.split('\n')[0], author: { name: commit.commit.author?.name ?? commit.author?.login ?? 'Unknown author', login: commit.author?.login, avatarUrl: commit.author?.avatar_url, email: commit.commit.author?.email, date: commit.commit.author?.date ?? '' }, committer: { name: commit.commit.committer?.name ?? commit.committer?.login ?? 'Unknown committer', login: commit.committer?.login, avatarUrl: commit.committer?.avatar_url, email: commit.commit.committer?.email, date: commit.commit.committer?.date ?? '' }, parentShas: commit.parents?.map(parent => parent.sha) ?? [], branchRefs: [], tagRefs: [], ciState: 'unknown' };
  const pr = pulls[0];
  return { node, fullMessage: commit.commit.message, stats: commit.stats ?? { additions: 0, deletions: 0, total: 0 }, files: commit.files?.map(file) ?? [], verification: commit.commit.verification, pullRequest: pr ? { number: pr.number, title: pr.title, state: pr.state, mergedAt: pr.merged_at, headRef: pr.head.ref, baseRef: pr.base.ref } : undefined, checks: summary, partialErrors };
}

export function demoCommitDetails(sha: string): CommitGraphDetails {
  const node = DEMO_NODES.find(value => value.sha === sha) ?? DEMO_NODES[0];
  const files: CommitGraphFile[] = [{ filename: 'src/components/architecture/ArchitectureContext.tsx', status: 'modified', additions: 28, deletions: 7, changes: 35, patch: '@@ -42,6 +42,9 @@\n+export function CommitImpactSummary() {\n+  return <section>Architecture impact</section>;\n+}' }, { filename: 'src/architecture/analyze.ts', status: 'modified', additions: 12, deletions: 3, changes: 15, patch: '@@ -18,3 +18,4 @@\n+// Map changed files to owned components.' }];
  return { node, fullMessage: node.message, stats: { additions: 40, deletions: 10, total: 50 }, files, verification: { verified: true, reason: 'valid' }, pullRequest: node.pullRequest, checks: { state: node.ciState, total: 4, passed: node.ciState === 'passing' ? 4 : 3, failed: node.ciState === 'failing' ? 1 : 0, pending: 0, names: ['Type check', 'Unit tests', 'Lint', 'Build'], latestRunId: 'demo-148' }, partialErrors: [] };
}

export async function fetchComparison(repository: string, baseSha: string, targetSha: string): Promise<CommitComparison> {
  const encoded = repository.split('/').map(encodeURIComponent).join('/');
  const value = await rest<{ status: string; ahead_by: number; behind_by: number; total_commits: number; files?: NonNullable<RestCommit['files']>; commits?: RestCommit[] }>(`/repos/${encoded}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(targetSha)}`);
  const files = value.files?.map(file) ?? [];
  return { baseSha, targetSha, status: value.status, aheadBy: value.ahead_by, behindBy: value.behind_by, totalCommits: value.total_commits, additions: files.reduce((sum, item) => sum + item.additions, 0), deletions: files.reduce((sum, item) => sum + item.deletions, 0), files, commits: (value.commits ?? []).map(item => ({ sha: item.sha, shortSha: item.sha.slice(0, 7), message: item.commit.message.split('\n')[0], author: { name: item.commit.author?.name ?? item.author?.login ?? 'Unknown author', login: item.author?.login, date: item.commit.author?.date ?? '' }, parentShas: item.parents?.map(parent => parent.sha) ?? [], branchRefs: [], tagRefs: [], ciState: 'unknown' })) };
}

export function demoComparison(baseSha: string, targetSha: string): CommitComparison { const details = demoCommitDetails(targetSha); return { baseSha, targetSha, status: 'ahead', aheadBy: 2, behindBy: 0, totalCommits: 2, additions: details.stats.additions, deletions: details.stats.deletions, files: details.files, commits: DEMO_NODES.filter(node => node.sha === targetSha || node.parentShas.includes(baseSha)) }; }
