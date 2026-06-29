import type { FlowItem, FlowStage, FlowStageHistoryEntry, FlowStatus } from '../types/flow';
import { classifyActor, classifyAttention, classifyLifecycle, type EvidenceConfidence } from './delivery-semantics';
import { matchesStructuredSearch } from './structured-search';

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
  confidence: EvidenceConfidence;
  missingEvidence: string[];
}

export function classifyWorkflowItem(item: Partial<FlowItem>): ClassifiedWorkflowState {
  const result = classifyLifecycle({
    id: item.id,
    repositoryId: item.repositoryId,
    type: item.type,
    number: item.number,
    title: item.title,
    state: item.status,
    status: item.status,
    isDraft: item.isDraft,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    closedAt: item.closedAt,
    mergedAt: item.mergedAt,
    publishedAt: item.publishedAt,
    deployedAt: item.deployedAt,
    author: item.author?.login,
    authorIsBot: item.author?.isBot,
    assignees: item.assignees?.map(actor => actor.login),
    reviewState: item.reviewSummary?.state,
    requestedReviewers: item.reviewSummary?.requestedReviewers,
    checkState: item.checksSummary?.state,
    releasedAt: item.publishedAt,
    releaseEvidence: Boolean(item.publishedAt || item.type === 'release' && !item.isDraft),
    deploymentEvidence: Boolean(item.deployedAt || item.type === 'deployment'),
    sourceCompleteness: item.completeness,
  });
  return { ...result, stage: result.stage as FlowStage, status: result.status as FlowStatus };
}

export function normalizeWorkflowItem(item: FlowItem, mode: 'live' | 'demo' = item.sourceMode ?? 'live', referenceTime?: string, viewerLogin?: string): FlowItem {
  const classified = classifyWorkflowItem(item);
  const history = dedupeStageHistory(item.stageHistory ?? fallbackHistory(item, classified.stage));
  const actorClassification = classifyActor(item.author?.login, item.isBot ?? item.author?.isBot);
  const attention = classifyAttention({
    id: item.id,
    repositoryId: item.repositoryId,
    type: item.type,
    state: item.status,
    updatedAt: item.updatedAt,
    author: item.author?.login,
    assignees: item.assignees?.map(actor => actor.login),
    reviewState: item.reviewSummary?.state,
    requestedReviewers: item.reviewSummary?.requestedReviewers,
    checkState: item.checksSummary?.state,
  }, viewerLogin);
  const inclusionLabels: Record<string, string> = { assigned: 'Assigned to you', assigned_to_you: 'Assigned to you', authored: 'Authored by you', authored_by_you: 'Authored by you', review_requested_from_you: 'Review requested', reviewed_by_you: 'You participated', commented_on_by_you: 'You participated', merged_contribution: 'Authored by you · Recently merged', release_published_by_you: 'Published by you', deployment_triggered_by_you: 'Triggered by you' };
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
    actorClassification,
    inclusionReason: item.viewerRelationship?.label ?? inclusionLabels[item.inclusionReason ?? ''] ?? item.inclusionReason,
    confidence: classified.confidence,
    missingEvidence: classified.missingEvidence,
    attentionReasons: attention.reasons,
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
  return items.filter(item => (!filters.repositoryId || item.repositoryId === filters.repositoryId)
    && (!filters.stage || item.stage === filters.stage)
    && (!filters.activeOnly || !['merged', 'released', 'deployed', 'closed'].includes(item.stage))
    && (!filters.statusFilter || filters.statusFilter === 'all' || (filters.statusFilter === 'attention' && (item.attentionReasons?.length || item.status === 'failing' || item.status === 'changes_requested')) || (filters.statusFilter === 'waiting_review' && item.stage === 'review') || (filters.statusFilter === 'failing' && item.status === 'failing') || (filters.statusFilter === 'merged' && item.stage === 'merged'))
    && (!filters.search.trim() || matchesStructuredSearch({
      title: item.title,
      repository: item.repositoryName,
      number: item.number,
      author: item.author?.login,
      labels: item.labels?.map(label => label.name),
      stage: item.stage,
      state: item.status,
      isDraft: item.isDraft,
      checks: item.checksSummary?.state,
      review: item.reviewSummary?.state,
      type: item.type,
      branch: item.headBranch,
    }, filters.search)));
}

export function canonicalAttentionItems(items: FlowItem[]): FlowItem[] {
  return items.filter(item => Boolean(item.attentionReasons?.length) || item.status === 'failing' || item.status === 'changes_requested');
}

export function homePreview(items: FlowItem[], limit = 2): Record<FlowStage, FlowItem[]> {
  return WORKFLOW_STAGES.reduce((result, stage) => ({ ...result, [stage.id]: items.filter(item => item.stage === stage.id).slice(0, limit) }), {} as Record<FlowStage, FlowItem[]>);
}

export function recentlyActiveRepositories(items: FlowItem[], limit = 4) {
  const repos = new Map<string, { id: string; nameWithOwner: string; lastActivityAt: string; activeItems: number; status: 'healthy' | 'attention'; reason: string }>();
  items.forEach(item => {
    const current = repos.get(item.repositoryId);
    const active = !['merged', 'released', 'deployed', 'closed'].includes(item.stage);
    const attention = item.status === 'failing' || item.status === 'changes_requested';
    const reason = item.status === 'failing' ? 'Failing checks' : item.stage === 'review' ? 'Review requested' : item.stage === 'merged' ? 'Recent merge' : 'Recent meaningful activity';
    repos.set(item.repositoryId, { id: item.repositoryId, nameWithOwner: item.repositoryName, lastActivityAt: current && current.lastActivityAt > item.updatedAt ? current.lastActivityAt : item.updatedAt, activeItems: (current?.activeItems ?? 0) + (active ? 1 : 0), status: attention || current?.status === 'attention' ? 'attention' : 'healthy', reason: attention || !current || item.updatedAt >= current.lastActivityAt ? reason : current.reason });
  });
  return [...repos.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.nameWithOwner.localeCompare(b.nameWithOwner)).slice(0, limit);
}

export function recentMerges(items: FlowItem[], limit = 4): FlowItem[] {
  return items.filter(item => item.stage === 'merged' && item.mergedAt).sort((a, b) => b.mergedAt!.localeCompare(a.mergedAt!) || a.id.localeCompare(b.id)).slice(0, limit);
}
