import { normalizeRepositoryName } from '../analytics/identity';
import type { SimulatorEvent } from '../simulator/simulator-types';
import type { CommitCheckSummary, CommitCiState } from './types';

type WorkflowState = 'passing' | 'failing' | 'pending' | 'cancelled' | 'skipped' | 'unknown';

interface IndexedRun {
  event: SimulatorEvent;
  state: WorkflowState;
  workflowKey: string;
  timestamp: number;
}

interface WorkflowJobStatus {
  name: string;
  status: string;
  conclusion: string | null;
}

function stringMetadata(event: SimulatorEvent, key: string): string | undefined {
  const value = event.metadata[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function workflowState(event: SimulatorEvent): WorkflowState {
  const status = stringMetadata(event, 'status')?.toLowerCase();
  const conclusion = stringMetadata(event, 'conclusion')?.toLowerCase();
  if (status && status !== 'completed') return 'pending';
  if (conclusion === 'success' || conclusion === 'neutral') return 'passing';
  if (conclusion === 'cancelled') return 'cancelled';
  if (conclusion === 'skipped') return 'skipped';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure' || conclusion === 'action_required') return 'failing';
  return 'unknown';
}

function workflowKey(event: SimulatorEvent): string {
  return stringMetadata(event, 'workflowId')
    ?? stringMetadata(event, 'workflowPath')
    ?? event.subjectTitle
    ?? event.id;
}

function runTimestamp(event: SimulatorEvent): number {
  const value = stringMetadata(event, 'updatedAt') ?? event.occurredAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function repositoryMatches(event: SimulatorEvent, repository: string): boolean {
  const expected = normalizeRepositoryName(repository);
  return normalizeRepositoryName(event.repositoryId) === expected || normalizeRepositoryName(event.repositoryName) === expected;
}

function summarize(runs: IndexedRun[]): CommitCheckSummary {
  const ordered = runs.slice().sort((left, right) => {
    const stateOrder: Record<WorkflowState, number> = { passing: 0, skipped: 0, failing: 1, pending: 2, cancelled: 3, unknown: 4 };
    return stateOrder[left.state] - stateOrder[right.state] || left.event.subjectTitle.localeCompare(right.event.subjectTitle);
  });
  const states = ordered.map(run => run.state);
  const latest = runs.slice().sort((left, right) => right.timestamp - left.timestamp)[0];
  const passed = states.filter(state => state === 'passing' || state === 'skipped').length;
  const failed = states.filter(state => state === 'failing').length;
  const pending = states.filter(state => state === 'pending').length;
  let state: CommitCiState = 'unknown';
  if (failed > 0) state = 'failing';
  else if (pending > 0) state = 'pending';
  else if (runs.length > 0 && passed === runs.length) state = 'passing';
  else if (runs.length > 0 && states.every(value => value === 'cancelled')) state = 'cancelled';
  return {
    state,
    total: runs.length,
    passed,
    failed,
    pending,
    names: ordered.map(run => run.event.subjectTitle),
    latestRunId: latest ? stringMetadata(latest.event, 'runId') : undefined,
  };
}

export function summarizeWorkflowJobs(jobs: WorkflowJobStatus[]): CommitCheckSummary {
  const stateForJob = (job: WorkflowJobStatus): WorkflowState => {
    if (job.status !== 'completed') return 'pending';
    if (job.conclusion === 'success' || job.conclusion === 'neutral') return 'passing';
    if (job.conclusion === 'skipped') return 'skipped';
    if (job.conclusion === 'cancelled') return 'cancelled';
    if (job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'action_required') return 'failing';
    return 'unknown';
  };
  const stateOrder: Record<WorkflowState, number> = { passing: 0, skipped: 0, failing: 1, pending: 2, cancelled: 3, unknown: 4 };
  const ordered = jobs.map(job => ({ job, state: stateForJob(job) })).sort((left, right) => stateOrder[left.state] - stateOrder[right.state] || left.job.name.localeCompare(right.job.name));
  const passed = ordered.filter(item => item.state === 'passing' || item.state === 'skipped').length;
  const failed = ordered.filter(item => item.state === 'failing').length;
  const pending = ordered.filter(item => item.state === 'pending').length;
  let state: CommitCiState = 'unknown';
  if (failed > 0) state = 'failing';
  else if (pending > 0) state = 'pending';
  else if (jobs.length > 0 && passed === jobs.length) state = 'passing';
  else if (jobs.length > 0 && ordered.every(item => item.state === 'cancelled')) state = 'cancelled';
  return { state, total: jobs.length, passed, failed, pending, names: ordered.map(item => item.job.name) };
}

/** Indexes the shared CI Activity workflow-run cache by commit SHA. */
export function indexCommitCiSummaries(runs: SimulatorEvent[], repository: string): Map<string, CommitCheckSummary> {
  const byCommitAndWorkflow = new Map<string, IndexedRun>();
  for (const event of runs) {
    if (event.subjectType !== 'workflow_run' || !repositoryMatches(event, repository)) continue;
    const sha = stringMetadata(event, 'headSha')?.toLowerCase();
    if (!sha) continue;
    const indexed: IndexedRun = { event, state: workflowState(event), workflowKey: workflowKey(event), timestamp: runTimestamp(event) };
    const key = `${sha}:${indexed.workflowKey.toLowerCase()}`;
    const existing = byCommitAndWorkflow.get(key);
    if (!existing || indexed.timestamp >= existing.timestamp) byCommitAndWorkflow.set(key, indexed);
  }

  const grouped = new Map<string, IndexedRun[]>();
  for (const run of byCommitAndWorkflow.values()) {
    const sha = stringMetadata(run.event, 'headSha')!.toLowerCase();
    grouped.set(sha, [...(grouped.get(sha) ?? []), run]);
  }
  return new Map([...grouped].map(([sha, commitRuns]) => [sha, summarize(commitRuns)]));
}
