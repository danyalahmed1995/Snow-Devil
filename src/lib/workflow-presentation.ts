import type { FlowItem, FlowStage, FlowStageHistoryEntry, FlowStatus } from '../types/flow';

export const WORKFLOW_STAGES: ReadonlyArray<{ id: FlowStage; label: string }> = [
  { id: 'issues', label: 'Issues' },
  { id: 'coding', label: 'Coding' },
  { id: 'pull_requests', label: 'Pull Requests' },
  { id: 'review', label: 'Review' },
  { id: 'checks', label: 'Checks' },
  { id: 'ready', label: 'Ready' },
  { id: 'merged', label: 'Merged' },
  { id: 'released', label: 'Released' },
  { id: 'deployed', label: 'Deployed' },
];

export interface WorkflowFilters {
  search: string;
  stage?: FlowStage;
  activeOnly: boolean;
  repositoryId?: string;
  statusFilter?: 'all' | 'attention' | 'waiting_review' | 'failing' | 'merged';
}

export interface ClassifiedWorkflowState {
  stage: FlowStage;
  status: FlowStatus;
  reason: string;
}

export function classifyWorkflowItem(item: Partial<FlowItem>): ClassifiedWorkflowState {
  if (item.type === 'deployment' || item.status === 'deployed' || item.deployedAt) return { stage: 'deployed', status: 'deployed', reason: 'A successful deployment observation is present.' };
  if (item.type === 'release' && item.isDraft) return { stage: 'coding', status: 'idle', reason: 'The release is still a draft.' };
  if (item.type === 'release' || item.status === 'released' || item.publishedAt) return { stage: 'released', status: 'released', reason: item.isPrerelease ? 'A prerelease was published.' : 'A published release is present.' };
  if (item.status === 'merged' || item.mergedAt) return { stage: 'merged', status: 'merged', reason: `The pull request was merged${item.mergedAt ? ` at ${new Date(item.mergedAt).toLocaleString()}` : ''}.` };
  if (item.status === 'closed' || item.closedAt) return { stage: 'closed', status: 'closed', reason: 'The item was closed without evidence that it merged.' };
  if (item.type === 'issue') return { stage: 'issues', status: item.status ?? 'active', reason: item.inclusionReason ? `Open issue: ${item.inclusionReason}.` : 'The issue is open and no active implementation link is available.' };

  const checks = item.checksSummary?.state ?? 'MISSING';
  const review = item.reviewSummary?.state ?? 'NONE';
  const failing = checks === 'FAILURE' || checks === 'ERROR';
  const pending = checks === 'PENDING' || checks === 'EXPECTED';
  if (failing) return { stage: 'checks', status: 'failing', reason: `${item.checksSummary?.failureCount || 1} required check${item.checksSummary?.failureCount === 1 ? '' : 's'} failed.` };
  if (pending) return { stage: 'checks', status: 'active', reason: 'Required checks are still queued or running.' };
  if (review === 'CHANGES_REQUESTED') return { stage: 'review', status: 'changes_requested', reason: 'Review changes were requested and have not been superseded by an approval.' };
  if (review === 'APPROVED' && !item.isDraft) return { stage: 'ready', status: 'approved', reason: checks === 'SUCCESS' ? 'Required approvals and checks have passed.' : 'Required approval is present; no required check result was reported.' };
  if (review === 'REVIEW_REQUIRED' || review === 'PENDING' || (item.reviewSummary?.requestedReviewers.length ?? 0) > 0) {
    const count = item.reviewSummary?.requestedReviewers.length ?? 0;
    return { stage: 'review', status: 'active', reason: count ? `Waiting for review from ${count} requested reviewer${count === 1 ? '' : 's'}.` : 'A review is pending.' };
  }
  if (item.isDraft) return { stage: 'coding', status: 'idle', reason: 'The pull request is still marked as draft.' };
  return { stage: 'pull_requests', status: 'idle', reason: 'The pull request is open and has not entered review or required checks.' };
}

export function normalizeWorkflowItem(item: FlowItem, mode: 'live' | 'demo' = item.sourceMode ?? 'live', referenceTime?: string): FlowItem {
  const classified = classifyWorkflowItem(item);
  const history = dedupeStageHistory(item.stageHistory ?? fallbackHistory(item, classified.stage));
  return {
    ...item,
    stage: classified.stage,
    status: classified.status,
    stageReason: item.stageReason ?? classified.reason,
    stageEnteredAt: item.stageEnteredAt ?? stageEntryTimestamp(history, classified.stage) ?? item.updatedAt,
    completeness: item.completeness ?? (item.stageHistory?.length ? 'complete' : 'partial'),
    completenessReason: item.completenessReason ?? (!item.stageHistory?.length ? 'Stage history is inferred from available entity timestamps.' : undefined),
    sourceMode: mode,
    sourceType: item.sourceType ?? item.type,
    referenceTime: referenceTime ?? item.referenceTime,
    isBot: item.isBot ?? item.author?.isBot ?? false,
    stageHistory: history,
  };
}

function fallbackHistory(item: FlowItem, stage: FlowStage): FlowStageHistoryEntry[] {
  const entries: FlowStageHistoryEntry[] = [{ id: `${item.id}:created`, stage: item.type === 'issue' ? 'issues' : item.isDraft ? 'coding' : 'pull_requests', label: item.type === 'issue' ? 'Opened' : item.isDraft ? 'Draft opened' : 'Pull request opened', occurredAt: item.createdAt, inferred: true }];
  if (item.mergedAt) entries.push({ id: `${item.id}:merged`, stage: 'merged', label: 'Merged', occurredAt: item.mergedAt, inferred: true });
  if (item.publishedAt) entries.push({ id: `${item.id}:released`, stage: 'released', label: 'Released', occurredAt: item.publishedAt, inferred: true });
  if (item.deployedAt) entries.push({ id: `${item.id}:deployed`, stage: 'deployed', label: 'Deployed', occurredAt: item.deployedAt, inferred: true });
  if (!entries.some(entry => entry.stage === stage)) entries.push({ id: `${item.id}:${stage}`, stage, label: WORKFLOW_STAGES.find(value => value.id === stage)?.label ?? stage, occurredAt: item.stageEnteredAt ?? item.updatedAt, inferred: true });
  return entries;
}

export function dedupeStageHistory(history: FlowStageHistoryEntry[]): FlowStageHistoryEntry[] {
  const unique = new Map<string, FlowStageHistoryEntry>();
  history.forEach(entry => unique.set(`${entry.stage}:${entry.occurredAt}:${entry.label}`, entry));
  return [...unique.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

export function stageEntryTimestamp(history: FlowStageHistoryEntry[], stage: FlowStage): string | undefined {
  const matches = dedupeStageHistory(history).filter(entry => entry.stage === stage);
  return matches[matches.length - 1]?.occurredAt;
}

export function timeInStageHours(item: FlowItem, referenceTime = item.referenceTime ? new Date(item.referenceTime).getTime() : Date.now()): number | null {
  const timestamp = item.stageEnteredAt ?? stageEntryTimestamp(item.stageHistory ?? [], item.stage);
  if (!timestamp) return null;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? Math.max(0, (referenceTime - value) / 3600000) : null;
}

export function formatTimeInStage(item: FlowItem, referenceTime = item.referenceTime ? new Date(item.referenceTime).getTime() : Date.now()): string {
  const hours = timeInStageHours(item, referenceTime);
  if (hours == null) return 'Stage age unavailable';
  if (hours < 1) return '<1h in stage';
  if (hours < 48) return `${Math.floor(hours)}h in stage`;
  return `${Math.floor(hours / 24)}d in stage`;
}

export function filterWorkflowItems(items: FlowItem[], filters: WorkflowFilters): FlowItem[] {
  const search = filters.search.trim().toLowerCase();
  return items.filter(item => (!filters.repositoryId || item.repositoryId === filters.repositoryId)
    && (!filters.stage || item.stage === filters.stage)
    && (!filters.activeOnly || !['merged', 'released', 'deployed', 'closed'].includes(item.stage))
    && (!filters.statusFilter || filters.statusFilter === 'all' || (filters.statusFilter === 'attention' && (item.status === 'failing' || item.status === 'changes_requested')) || (filters.statusFilter === 'waiting_review' && item.stage === 'review') || (filters.statusFilter === 'failing' && item.status === 'failing') || (filters.statusFilter === 'merged' && item.stage === 'merged'))
    && (!search || `${item.title} ${item.repositoryName} ${item.number ?? ''} ${item.author?.login ?? ''} ${(item.labels ?? []).map(label => label.name).join(' ')}`.toLowerCase().includes(search)));
}

export function homePreview(items: FlowItem[], limit = 2): Record<FlowStage, FlowItem[]> {
  return WORKFLOW_STAGES.reduce((result, stage) => ({ ...result, [stage.id]: items.filter(item => item.stage === stage.id).slice(0, limit) }), {} as Record<FlowStage, FlowItem[]>);
}

export function recentlyActiveRepositories(items: FlowItem[], limit = 4) {
  const repos = new Map<string, { id: string; nameWithOwner: string; lastActivityAt: string; activeItems: number; status: 'healthy' | 'attention' }>();
  items.forEach(item => {
    const current = repos.get(item.repositoryId);
    const active = !['merged', 'released', 'deployed', 'closed'].includes(item.stage);
    const attention = item.status === 'failing' || item.status === 'changes_requested';
    repos.set(item.repositoryId, { id: item.repositoryId, nameWithOwner: item.repositoryName, lastActivityAt: current && current.lastActivityAt > item.updatedAt ? current.lastActivityAt : item.updatedAt, activeItems: (current?.activeItems ?? 0) + (active ? 1 : 0), status: attention || current?.status === 'attention' ? 'attention' : 'healthy' });
  });
  return [...repos.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.nameWithOwner.localeCompare(b.nameWithOwner)).slice(0, limit);
}

export function recentMerges(items: FlowItem[], limit = 4): FlowItem[] {
  return items.filter(item => item.stage === 'merged' && item.mergedAt).sort((a, b) => b.mergedAt!.localeCompare(a.mergedAt!) || a.id.localeCompare(b.id)).slice(0, limit);
}
