import { canonicalRepositoryIdentity, canonicalWorkflowRunIdentity } from '../lib/canonical-identity';
import { safeExternalUrl } from '../lib/browser-actions';

export type CIRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
export type CIRunConclusion = 'success' | 'failure' | 'cancelled' | 'timed_out' | 'action_required' | 'neutral' | 'skipped' | 'stale' | 'startup_failure';

export interface CIWorkflowRun {
  id: string;
  runId: number;
  repositoryId: string;
  workflowName: string;
  runNumber: number;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  pullRequestNumber?: number;
  event?: string;
  actor?: string;
  status: CIRunStatus;
  conclusion?: CIRunConclusion;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
  runAttempt: number;
  url: string;
}

const STATUSES = new Set<CIRunStatus>(['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending']);
const CONCLUSIONS = new Set<CIRunConclusion>(['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale', 'startup_failure']);

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function string(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }

export function isWorkflowRunsPage(value: unknown): value is { workflow_runs: unknown[] } {
  return object(value) && Array.isArray(value.workflow_runs);
}

export function normalizeWorkflowRuns(repository: string, body: unknown): CIWorkflowRun[] {
  let repositoryId: string;
  try { repositoryId = canonicalRepositoryIdentity(repository); } catch { return []; }
  const values = isWorkflowRunsPage(body) ? body.workflow_runs.slice(0, 30) : [];
  const unique = new Map<string, CIWorkflowRun>();
  for (const value of values) {
    if (!object(value)) continue;
    const runId = number(value.id);
    const status = string(value.status) as CIRunStatus | undefined;
    const createdAt = string(value.created_at);
    const updatedAt = string(value.updated_at);
    if (!runId || !status || !STATUSES.has(status) || !createdAt || !updatedAt) continue;
    const explicit = safeExternalUrl(string(value.html_url));
    const expectedPath = `/${repositoryId}/actions/runs/${runId}`;
    const url = explicit && new URL(explicit).hostname === 'github.com' && new URL(explicit).pathname.toLowerCase() === expectedPath ? explicit : `https://github.com/${repositoryId.split('/').map(encodeURIComponent).join('/')}/actions/runs/${runId}`;
    const conclusionValue = string(value.conclusion) as CIRunConclusion | undefined;
    const actor = object(value.actor) ? string(value.actor.login) : undefined;
    const commit = object(value.head_commit) ? value.head_commit : undefined;
    const pullRequests = Array.isArray(value.pull_requests) ? value.pull_requests.filter(object) : [];
    const startedAt = string(value.run_started_at);
    const completedAt = status === 'completed' ? updatedAt : undefined;
    const startMs = Date.parse(startedAt ?? createdAt);
    const endMs = Date.parse(completedAt ?? updatedAt);
    const run: CIWorkflowRun = {
      id: canonicalWorkflowRunIdentity(repositoryId, runId), runId, repositoryId,
      workflowName: string(value.name) ?? string(value.display_title) ?? 'Workflow run',
      runNumber: number(value.run_number) ?? 0,
      branch: string(value.head_branch), commitSha: string(value.head_sha), commitMessage: commit ? string(commit.message) : undefined,
      pullRequestNumber: pullRequests.length ? number(pullRequests[0].number) : undefined,
      event: string(value.event), actor, status,
      conclusion: conclusionValue && CONCLUSIONS.has(conclusionValue) ? conclusionValue : undefined,
      createdAt, startedAt, updatedAt, completedAt,
      durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : undefined,
      runAttempt: number(value.run_attempt) ?? 1, url,
    };
    const previous = unique.get(run.id);
    if (!previous || run.updatedAt >= previous.updatedAt) unique.set(run.id, run);
  }
  return [...unique.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 20);
}

export function ciPollingInterval(runs: CIWorkflowRun[]): number {
  return runs.some(run => run.status !== 'completed') ? 30_000 : 180_000;
}

export function ciRunTransitions(previous: CIWorkflowRun[], next: CIWorkflowRun[]) {
  const previousById = new Map(previous.map(run => [run.id, run]));
  return next.flatMap(run => {
    const before = previousById.get(run.id);
    return before && (before.status !== run.status || before.conclusion !== run.conclusion) ? [{ before, after: run }] : [];
  });
}
