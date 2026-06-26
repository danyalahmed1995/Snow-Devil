export const DELIVERY_STAGES = [
  'issues',
  'coding',
  'pull_requests',
  'review',
  'checks',
  'ready',
  'merged',
  'released',
  'deployed',
] as const;

export type DeliveryStage = typeof DELIVERY_STAGES[number];
export type DeliveryStageOrHistorical = DeliveryStage | 'closed' | 'absent';
export type EvidenceConfidence = 'exact' | 'matched' | 'inferred' | 'partial' | 'unlinked' | 'unavailable';
export type ActorClassification = 'human' | 'dependabot' | 'renovate' | 'other_bot' | 'unknown';
export type ActivityClassification = 'active' | 'aging' | 'stale' | 'dormant' | 'historical';
export type AttentionReason =
  | 'failed_required_checks'
  | 'review_requested_from_you'
  | 'changes_requested'
  | 'merge_conflict'
  | 'stale_blocker'
  | 'assigned_to_you'
  | 'mention_requiring_response';

export interface SemanticWorkItem {
  id?: string;
  repositoryId?: string;
  type?: string;
  number?: number;
  title?: string;
  state?: string;
  status?: string;
  isDraft?: boolean;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  releasedAt?: string;
  publishedAt?: string;
  deployedAt?: string;
  releaseEvidence?: boolean;
  deploymentEvidence?: boolean;
  reviewState?: string;
  requestedReviewers?: string[];
  checkState?: string;
  requiredChecksKnown?: boolean;
  mergeable?: string | boolean;
  author?: string;
  authorIsBot?: boolean;
  assignees?: string[];
  mentions?: string[];
  sourceCompleteness?: string;
  linkedEntityId?: string;
}

export interface LifecycleClassification {
  stage: DeliveryStageOrHistorical;
  status: string;
  reason: string;
  confidence: EvidenceConfidence;
  missingEvidence: string[];
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function confidenceFor(item: SemanticWorkItem, explicit = true): EvidenceConfidence {
  const completeness = normalized(item.sourceCompleteness);
  if (completeness === 'complete') return explicit ? 'exact' : 'matched';
  if (completeness === 'partial') return 'partial';
  if (completeness === 'unknown') return 'unavailable';
  return explicit ? 'exact' : 'inferred';
}

export function classifyLifecycle(item: SemanticWorkItem): LifecycleClassification {
  const type = normalized(item.type);
  const state = normalized(item.state || item.status);
  const review = normalized(item.reviewState);
  const checks = normalized(item.checkState);
  const missingEvidence: string[] = [];

  if (item.deployedAt || item.deploymentEvidence || type === 'deployment' && ['success', 'succeeded', 'deployed'].includes(state)) {
    return { stage: 'deployed', status: 'deployed', reason: 'Explicit successful deployment evidence is present.', confidence: confidenceFor(item), missingEvidence };
  }
  if (item.releasedAt || item.publishedAt || item.releaseEvidence || type === 'release' && !item.isDraft) {
    return { stage: 'released', status: 'released', reason: 'Published release evidence is present.', confidence: confidenceFor(item), missingEvidence };
  }
  if (item.mergedAt || state === 'merged') {
    if (!item.releaseEvidence && !item.releasedAt && !item.publishedAt) missingEvidence.push('No linked release evidence');
    if (!item.deploymentEvidence && !item.deployedAt) missingEvidence.push('No linked deployment evidence');
    return { stage: 'merged', status: 'merged', reason: 'The pull request has explicit merge evidence.', confidence: confidenceFor(item), missingEvidence };
  }
  if (item.closedAt || state === 'closed') {
    return { stage: 'closed', status: 'closed', reason: 'The item is closed without merge evidence.', confidence: confidenceFor(item), missingEvidence };
  }
  if (type === 'issue') {
    return { stage: 'issues', status: state || 'active', reason: 'The issue is open and no linked implementation has superseded it.', confidence: confidenceFor(item), missingEvidence };
  }
  if (type === 'branch' || type === 'commit') {
    return { stage: 'coding', status: state || 'active', reason: 'Active implementation evidence exists on a branch or commit.', confidence: confidenceFor(item), missingEvidence };
  }
  if (type === 'release' && item.isDraft) {
    return { stage: 'coding', status: 'idle', reason: 'The release is still a draft.', confidence: confidenceFor(item), missingEvidence };
  }
  if (item.isDraft || state === 'draft') {
    return { stage: 'coding', status: 'idle', reason: 'The pull request is a draft implementation.', confidence: confidenceFor(item), missingEvidence };
  }

  const failedChecks = ['failure', 'failed', 'error', 'timed_out', 'action_required'].includes(checks);
  const runningChecks = ['expected', 'pending', 'queued', 'running', 'in_progress'].includes(checks);
  if (failedChecks) {
    return { stage: 'checks', status: 'failing', reason: 'Required checks are failing.', confidence: confidenceFor(item), missingEvidence };
  }
  if (runningChecks) {
    return { stage: 'checks', status: 'active', reason: 'Required checks are queued or running.', confidence: confidenceFor(item), missingEvidence };
  }
  if (review === 'changes_requested') {
    return { stage: 'review', status: 'changes_requested', reason: 'Review changes were requested and have not been superseded.', confidence: confidenceFor(item), missingEvidence };
  }
  const reviewRequested = ['requested', 'review_required', 'pending'].includes(review) || (item.requestedReviewers?.length ?? 0) > 0;
  const checksPassed = ['success', 'passed', 'neutral', 'skipped'].includes(checks);
  if (review === 'approved' && checksPassed) {
    return { stage: 'ready', status: 'approved', reason: 'Required approval and passing checks are present.', confidence: confidenceFor(item), missingEvidence };
  }
  if (review === 'approved' && !checksPassed) {
    missingEvidence.push('Passing required-check evidence is missing');
    return { stage: 'checks', status: 'blocked', reason: 'Approval is present, but required checks are not proven to have passed.', confidence: 'partial', missingEvidence };
  }
  if (reviewRequested) {
    return { stage: 'review', status: 'active', reason: item.requestedReviewers?.length ? `Waiting for ${item.requestedReviewers.length} requested reviewer${item.requestedReviewers.length === 1 ? '' : 's'}.` : 'A review is required.', confidence: confidenceFor(item), missingEvidence };
  }
  return { stage: 'pull_requests', status: 'idle', reason: 'The pull request is open without a proven review or check blocker.', confidence: confidenceFor(item), missingEvidence };
}

export function classifyActor(login?: string, explicitBot?: boolean): ActorClassification {
  const value = normalized(login);
  if (!value) return 'unknown';
  if (/^dependabot(?:\[bot\])?$/.test(value)) return 'dependabot';
  if (/^(renovate|renovate-bot)(?:\[bot\])?$/.test(value)) return 'renovate';
  if (explicitBot || value.endsWith('[bot]') || value.endsWith('-bot') || value.startsWith('bot-')) return 'other_bot';
  return 'human';
}

export function isActorIncluded(classification: ActorClassification, options: { includeBots: boolean; includeDependabot?: boolean; includeRenovate?: boolean; includeOtherBots?: boolean }): boolean {
  if (classification === 'human' || classification === 'unknown') return true;
  if (!options.includeBots) return false;
  if (classification === 'dependabot') return options.includeDependabot ?? true;
  if (classification === 'renovate') return options.includeRenovate ?? true;
  return options.includeOtherBots ?? true;
}

export function classifyAttention(item: SemanticWorkItem, currentUser?: string, activity?: ActivityClassification): { needsAttention: boolean; reasons: AttentionReason[] } {
  const reasons: AttentionReason[] = [];
  const checks = normalized(item.checkState);
  const review = normalized(item.reviewState);
  const user = normalized(currentUser);
  if (['failure', 'failed', 'error', 'timed_out', 'action_required'].includes(checks)) reasons.push('failed_required_checks');
  if (review === 'changes_requested') reasons.push('changes_requested');
  if (user && item.requestedReviewers?.some(login => normalized(login) === user)) reasons.push('review_requested_from_you');
  if (item.mergeable === false || normalized(item.mergeable) === 'conflicting') reasons.push('merge_conflict');
  if (activity === 'stale' && ['failure', 'failed', 'error', 'changes_requested', 'requested'].includes(checks || review)) reasons.push('stale_blocker');
  if (user && item.assignees?.some(login => normalized(login) === user)) reasons.push('assigned_to_you');
  if (user && item.mentions?.some(login => normalized(login) === user)) reasons.push('mention_requiring_response');
  return { needsAttention: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function classifyActivity(item: SemanticWorkItem, options: { referenceTime: string | number | Date; activeWindowDays: number; agingDays: number; staleDays: number }): ActivityClassification {
  const state = normalized(item.state || item.status);
  if (item.closedAt || item.mergedAt || item.releasedAt || item.publishedAt || item.deployedAt || ['closed', 'merged', 'released', 'deployed', 'superseded', 'archived'].includes(state)) return 'historical';
  const reference = new Date(options.referenceTime).getTime();
  const activity = new Date(item.updatedAt ?? item.createdAt ?? 0).getTime();
  if (!Number.isFinite(reference) || !Number.isFinite(activity) || activity <= 0) return 'dormant';
  const days = Math.max(0, (reference - activity) / 86400000);
  if (days > options.activeWindowDays) return 'dormant';
  if (days >= options.staleDays) return 'stale';
  if (days >= options.agingDays) return 'aging';
  return 'active';
}

export function uniqueWorkItemIdentity(item: SemanticWorkItem): string {
  const repository = normalized(item.repositoryId) || 'unlinked';
  const type = normalized(item.type) || 'other';
  if (item.number != null && ['issue', 'pull_request'].includes(type)) return `${repository}:${type}:${item.number}`;
  if (item.linkedEntityId) return `${repository}:linked:${item.linkedEntityId}`;
  if (item.id) return `${repository}:${type}:${item.id}`;
  return `${repository}:${type}:${normalized(item.title) || 'unlinked'}`;
}

export function confidenceFromEvidence(input: { completeness?: string; linked?: boolean; inferred?: boolean; available?: boolean }): EvidenceConfidence {
  if (input.available === false) return 'unavailable';
  if (input.linked === false) return 'unlinked';
  if (input.inferred) return input.completeness === 'partial' ? 'partial' : 'inferred';
  if (input.linked) return input.completeness === 'complete' ? 'matched' : 'partial';
  return input.completeness === 'complete' ? 'exact' : input.completeness === 'partial' ? 'partial' : 'unavailable';
}
