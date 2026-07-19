import { ageBandForDays, businessDaysBetween, businessHoursBetween, calendarFromSettings, type BusinessCalendar } from './business-time';
import { canonicalRepositoryIdentity } from '../lib/canonical-identity';
import { median, percentile } from './math';
import type {
  AgeBand,
  AnalyticsDataset,
  AnalyticsInspectable,
  AnalyticsRepository,
  AnalyticsSettings,
  CiStatus,
  DeliveryEntity,
  DeliveryEvent,
  InventoryItem,
  InventoryType,
  DeliveryRiskCategory,
  LeadTimeMetric,
  LeadTimeSample,
  RepositoryHealth,
} from './types';
import { effectiveRepositorySettings } from '../stores/analytics-settings-store';
import { classifyActivity, classifyActor, isActorIncluded, uniqueWorkItemIdentity } from '../lib/delivery-semantics';

const DAY = 24 * 60 * 60 * 1000;

export function includedRepositories(dataset: AnalyticsDataset, settings: AnalyticsSettings): AnalyticsRepository[] {
  return dataset.repositories.filter(repository => {
    const effective = effectiveRepositorySettings(settings, repository.id);
    if (!effective.included) return false;
    if (settings.includedRepositories.length > 0 && !settings.includedRepositories.includes(repository.id)) return false;
    if (!settings.includeArchived && repository.archived) return false;
    if (!settings.includeForks && repository.fork) return false;
    if (!settings.includePrivate && repository.private) return false;
    return true;
  });
}

function activeBranchHours(dataset: AnalyticsDataset, repositoryId: string, settings: AnalyticsSettings) {
  const calendar = calendarFromSettings(settings);
  return dataset.branches
    .filter(branch => branch.repositoryId === repositoryId && !branch.defaultBranch && !branch.mergedAt && !branch.deletedAt)
    .map(branch => ({ branch, hours: businessHoursBetween(branch.firstObservedAt, dataset.referenceDate, calendar) }));
}

function completedBranchHours(dataset: AnalyticsDataset, repositoryId: string, settings: AnalyticsSettings): number[] {
  const calendar = calendarFromSettings(settings);
  return dataset.branches
    .filter(branch => branch.repositoryId === repositoryId && !branch.defaultBranch && (branch.mergedAt || branch.deletedAt))
    .map(branch => businessHoursBetween(branch.firstObservedAt, branch.mergedAt ?? branch.deletedAt!, calendar));
}

function ciGrade(overThreshold: number, severe: number, staleDays: number, integrationsPerWeek: number, hasEvidence: boolean): { status: CiStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (!hasEvidence) return { status: 'unknown', reasons: ['No qualifying branch or default-branch integration evidence is available'] };
  if (overThreshold === 0) reasons.push('No active branches exceed the configured threshold');
  else reasons.push(`${overThreshold} active branch${overThreshold === 1 ? '' : 'es'} exceed the configured threshold`);
  if (staleDays > 14) reasons.push(`Default branch has been inactive for ${Math.floor(staleDays)} days`);
  else if (staleDays > 7) reasons.push('Default branch activity is older than one week');
  else reasons.push('Default branch activity is recent');
  if (integrationsPerWeek < 1) reasons.push('Integration frequency is below one per week');
  else reasons.push(`${integrationsPerWeek.toFixed(1)} integrations per week in the selected range`);

  if (severe >= 2 || (overThreshold >= 3 && staleDays > 14)) return { status: 'poor', reasons };
  if (overThreshold > 0 || staleDays > 7 || integrationsPerWeek < 1) return { status: 'warning', reasons };
  if (staleDays > 3 || integrationsPerWeek < 5) return { status: 'healthy', reasons };
  return { status: 'excellent', reasons };
}

export function repositoryHealth(dataset: AnalyticsDataset, settings: AnalyticsSettings, rangeDays: number): RepositoryHealth[] {
  const repositories = includedRepositories(dataset, settings);
  const rangeStart = new Date(new Date(dataset.referenceDate).getTime() - rangeDays * DAY).toISOString();
  return repositories.map(repository => {
    const effective = effectiveRepositorySettings(settings, repository.id);
    const active = activeBranchHours(dataset, repository.id, settings);
    const completed = completedBranchHours(dataset, repository.id, settings);
    const integrations = dataset.events.filter(event => event.repositoryId === repository.id && event.occurredAt >= rangeStart && (event.type === 'merged' || event.directPush));
    const last = integrations.length > 0 ? integrations[integrations.length - 1].occurredAt : undefined;
    const staleDays = last ? (new Date(dataset.referenceDate).getTime() - new Date(last).getTime()) / DAY : rangeDays;
    const overThreshold = active.filter(item => item.hours > effective.branchThresholdHours).length;
    const severe = active.filter(item => item.hours > effective.branchThresholdHours * 3).length;
    const integrationsPerWeek = integrations.length / Math.max(1, rangeDays / 7);
    const hasEvidence = active.length > 0 || completed.length > 0 || integrations.length > 0;
    const grade = ciGrade(overThreshold, severe, staleDays, integrationsPerWeek, hasEvidence);
    return {
      repository,
      status: grade.status,
      reasons: grade.reasons,
      openBranches: active.length,
      branchesOverThreshold: overThreshold,
      oldestActiveHours: active.length ? Math.max(...active.map(item => item.hours)) : null,
      lastDefaultBranchActivity: last,
      integrations: integrations.length,
      integrationsPerWeek,
      directPushes: integrations.filter(item => item.directPush).length,
      p50BranchHours: percentile(completed, 50),
      p90BranchHours: percentile(completed, 90),
      estimated: dataset.branches.some(branch => branch.repositoryId === repository.id && branch.estimated),
      sampleCount: completed.length,
      coverage: !hasEvidence ? 'unavailable' : dataset.partial ? 'partial' : 'complete',
    };
  });
}

export function overallCiStatus(rows: RepositoryHealth[]): CiStatus {
  const rank: Record<CiStatus, number> = { excellent: 0, healthy: 1, unknown: 2, unsupported: 2, warning: 3, poor: 4, sync_failed: 5 };
  return rows.reduce<CiStatus>((worst, row) => rank[row.status] > rank[worst] ? row.status : worst, 'excellent');
}

export function integrationStreak(dataset: AnalyticsDataset, repositoryId?: string): number {
  const days = new Set(dataset.events
    .filter(event => (!repositoryId || event.repositoryId === repositoryId) && (event.type === 'merged' || event.directPush))
    .map(event => event.occurredAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(dataset.referenceDate);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

type RiskCandidate = { type: InventoryType; category: DeliveryRiskCategory; reasonCode: string; reason: string; label: string; action: InventoryItem['suggestedAction']; startedAt?: string; actor?: string; evidenceId?: string; exact: boolean };

export interface CanonicalEntityState {
  state: string;
  authoritativeAt?: string;
  terminal: boolean;
  source: 'current_entity' | 'canonical_event' | 'cached_assertion' | 'historical_fallback';
  reason: string;
}

export interface DeliveryRiskInventoryAnalysis {
  items: InventoryItem[];
  canonicalEntityCount: number;
  classifiedRiskCount: number;
  terminalEntityCount: number;
  activeWithoutRiskCount: number;
  policyExcludedCount: number;
}

const MEANINGFUL_EVENTS = new Set<DeliveryEvent['type']>(['opened', 'committed', 'force_pushed', 'commented', 'review_comment_added', 'review_requested', 'review_request_removed', 'review_submitted', 'review_dismissed', 'approved', 'changes_requested', 'converted_to_draft', 'ready_for_review', 'check_queued', 'check_started', 'check_succeeded', 'check_failed', 'check_cancelled', 'merged', 'closed', 'reopened', 'deployment_failed', 'deployment_succeeded', 'released', 'assigned', 'unassigned', 'labeled', 'unlabeled']);
const RISK_SEVERITY: Record<DeliveryRiskCategory, number> = { delivery_blocked: 0, blocked: 1, ready_to_merge: 2, awaiting_review: 3, stale: 4, delivery_status_unknown: 5 };

function validTimestamp(value: string | undefined, reference: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  const referenceTime = Date.parse(reference);
  if (!Number.isFinite(timestamp) || !Number.isFinite(referenceTime) || timestamp <= 0 || timestamp > referenceTime + 5 * 60_000) return undefined;
  return new Date(timestamp).toISOString();
}

const ACTIVE_ENTITY_STATES = new Set(['open', 'active', 'draft', 'reopened', 'pending', 'in_progress', 'in progress']);
const TERMINAL_ENTITY_STATES = new Set(['closed', 'merged', 'completed', 'complete', 'done', 'resolved', 'deleted']);
const STATE_EVENTS = new Set<DeliveryEvent['type']>(['opened', 'reopened', 'ready_for_review', 'converted_to_draft', 'closed', 'merged', 'released', 'deployment_succeeded']);

/** Current entity assertions outrank lifecycle events and historical evidence. */
export function resolveCanonicalEntityState(entity: DeliveryEntity, events: DeliveryEvent[], referenceDate: string, branchDeleted = false): CanonicalEntityState {
  const current = entity.state.trim().toLowerCase();
  const currentAt = validTimestamp(entity.updatedAt, referenceDate);
  if (entity.type === 'branch' && branchDeleted) return { state: 'deleted', authoritativeAt: currentAt, terminal: true, source: 'current_entity', reason: 'The branch is deleted.' };
  if (entity.type === 'pull_request' && (entity.mergedAt || current === 'merged')) return { state: 'merged', authoritativeAt: validTimestamp(entity.mergedAt, referenceDate) ?? currentAt, terminal: true, source: 'current_entity', reason: 'The pull request is merged.' };
  if (ACTIVE_ENTITY_STATES.has(current)) return { state: current, authoritativeAt: currentAt, terminal: false, source: 'current_entity', reason: 'The current entity assertion is active.' };
  if (TERMINAL_ENTITY_STATES.has(current)) return { state: current, authoritativeAt: validTimestamp(entity.closedAt, referenceDate) ?? currentAt, terminal: true, source: 'current_entity', reason: `The current entity assertion is ${current}.` };
  if (entity.closedAt) return { state: 'closed', authoritativeAt: validTimestamp(entity.closedAt, referenceDate) ?? currentAt, terminal: true, source: 'cached_assertion', reason: 'A current closure assertion is present.' };

  const latestStateEvent = [...events].reverse().find(event => STATE_EVENTS.has(event.type));
  if (latestStateEvent) {
    const terminal = ['closed', 'merged', 'released', 'deployment_succeeded'].includes(latestStateEvent.type);
    return { state: latestStateEvent.type, authoritativeAt: latestStateEvent.occurredAt, terminal, source: 'canonical_event', reason: `The latest canonical state event is ${latestStateEvent.type.replace(/_/g, ' ')}.` };
  }
  return { state: current || entity.stage, authoritativeAt: currentAt ?? validTimestamp(entity.createdAt, referenceDate), terminal: false, source: 'historical_fallback', reason: 'No authoritative terminal assertion was found.' };
}

function evidenceMentions(entity: DeliveryEntity, pattern: RegExp): boolean {
  return entity.sourceCompleteness === 'complete' && (entity.evidence ?? []).some(value => pattern.test(value));
}

function normalizedChecks(entity: DeliveryEntity): InventoryItem['checksState'] {
  if (entity.checkState === 'success') return 'passing';
  if (entity.checkState === 'failure' || entity.checkState === 'cancelled') return 'failing';
  if (entity.checkState === 'queued' || entity.checkState === 'running') return 'pending';
  return entity.checkState === 'unknown' ? 'unknown' : 'unavailable';
}

function normalizedReview(entity: DeliveryEntity): InventoryItem['reviewSummaryState'] {
  if (entity.reviewState === 'approved') return 'approved';
  if (entity.reviewState === 'changes_requested') return 'changes_requested';
  if (entity.reviewState === 'requested') return 'review_requested';
  if (entity.reviewState === 'none') return 'none';
  return entity.sourceCompleteness === 'unknown' ? 'unknown' : 'unavailable';
}

function riskCandidates(entity: DeliveryEntity, repository: AnalyticsRepository, context: { idleAge?: number; staleDays: number; reviewWaitDays: number; events: DeliveryEvent[]; referenceDate: string; retentionStart: number; calendar: BusinessCalendar; currentState: CanonicalEntityState }): RiskCandidate[] {
  const candidates: RiskCandidate[] = [];
  const latest = (types: DeliveryEvent['type'][]) => [...context.events].reverse().find(event => types.includes(event.type));
  const mergedAt = validTimestamp(entity.mergedAt, context.referenceDate);
  const deliveryFailure = [...context.events].reverse().find(event => event.type === 'deployment_failed' && event.sourceCompleteness === 'complete' && (!mergedAt || event.occurredAt >= mergedAt));
  const isMergedWork = entity.type === 'pull_request' && (Boolean(mergedAt) || context.currentState.state === 'merged');
  if (deliveryFailure && isMergedWork) candidates.push({ type: 'merged_not_deployed', category: 'delivery_blocked', reasonCode: 'exact_downstream_failure', reason: 'Exact downstream evidence reports a failed deployment.', label: 'Delivery blocked', action: entity.runId ? 'Open CI' : 'Inspect evidence', startedAt: deliveryFailure.occurredAt, exact: true });

  const deliveryModel = repository.releaseMatching || repository.deploymentMatching;
  const deliveryUnknown = mergedAt && Date.parse(mergedAt) >= context.retentionStart && !repository.archived && deliveryModel && !deliveryFailure && (repository.releaseMatching && !entity.releasedAt || repository.deploymentMatching && !entity.deployedAt);
  if (deliveryUnknown) candidates.push({ type: repository.releaseMatching && !entity.releasedAt ? 'merged_not_released' : 'merged_not_deployed', category: 'delivery_status_unknown', reasonCode: 'delivery_evidence_inconclusive', reason: 'The pull request was merged, but Snow Devil cannot determine its delivery status.', label: 'Delivery status unknown', action: 'Confirm delivery', startedAt: mergedAt, exact: false });
  if (context.currentState.terminal) return candidates;

  const historicalBlockersStillCurrent = !latest(['reopened']);
  const mergeConflict = entity.mergeability === 'conflicting' || historicalBlockersStillCurrent && (!entity.mergeability || entity.mergeability === 'unknown') && evidenceMentions(entity, /merge conflict|mergeable.*conflict|conflicting/i);
  const changesRequestedEvent = latest(['changes_requested']);
  const changesRequested = (entity.reviewDecision === 'changes_requested' || entity.reviewState === 'changes_requested') && entity.sourceCompleteness === 'complete';
  const requiredChecksFailing = entity.checkState === 'failure' && (context.events.some(event => event.type === 'check_failed' && event.requiredCheck === true && event.sourceCompleteness === 'complete') || evidenceMentions(entity, /required check(?:s)? (?:failed|failing|timed out|cancelled)|required status.*(?:failed|error)/i));
  const approvalCountMissing = entity.requiredApprovalCount != null && entity.requiredApprovalCount > (entity.qualifyingApprovalCount ?? 0);
  const approvalMissing = entity.reviewDecision === 'review_required' || approvalCountMissing || historicalBlockersStillCurrent && entity.reviewState !== 'approved' && evidenceMentions(entity, /required approval (?:missing|not met)|approval requirement not met/i);
  const approvalRequirementTransition = latest(['review_requested', 'review_dismissed']);
  const reviewReadyTransition = [...context.events].reverse().find(event => event.type === 'ready_for_review' && !event.observationOnly);
  const openedTransition = context.events.find(event => event.type === 'opened' && !event.observationOnly);
  const approvalMissingSince = approvalRequirementTransition?.sourceOccurredAt ?? approvalRequirementTransition?.occurredAt ?? reviewReadyTransition?.sourceOccurredAt ?? reviewReadyTransition?.occurredAt ?? entity.prOpenedAt ?? openedTransition?.sourceOccurredAt ?? openedTransition?.occurredAt ?? entity.createdAt;
  const policyBlocked = historicalBlockersStillCurrent && evidenceMentions(entity, /dependency blocker|branch protection.*not met|policy restriction|merge queue.*blocked/i);
  if (changesRequested) candidates.push({ type: 'changes_requested', category: 'blocked', reasonCode: 'changes_requested', reason: 'A recorded review requested changes.', label: 'Changes requested', action: 'Review changes', startedAt: changesRequestedEvent?.sourceOccurredAt ?? changesRequestedEvent?.occurredAt, actor: changesRequestedEvent?.actor, evidenceId: changesRequestedEvent?.id, exact: Boolean(changesRequestedEvent?.actor) && changesRequestedEvent?.sourceCompleteness === 'complete' });
  else if (mergeConflict) candidates.push({ type: 'changes_requested', category: 'blocked', reasonCode: 'merge_conflict', reason: 'Mergeability evidence reports a conflict.', label: 'Merge conflict', action: 'Open PR', startedAt: latest(['committed', 'force_pushed'])?.occurredAt ?? entity.updatedAt, exact: true });
  else if (requiredChecksFailing) candidates.push({ type: 'checks_failing', category: 'blocked', reasonCode: 'required_checks_failing', reason: 'Required checks are failing.', label: 'Required checks failing', action: 'Open CI', startedAt: latest(['check_failed'])?.occurredAt ?? entity.updatedAt, exact: true });
  else if (approvalMissing) candidates.push({ type: 'changes_requested', category: 'blocked', reasonCode: 'required_approval_missing', reason: (entity.requiredApprovalCount ?? 1) === 1 ? 'GitHub requires at least one approving review from a reviewer with write access before this pull request can merge.' : `GitHub requires at least ${entity.requiredApprovalCount} qualifying approving reviews before this pull request can merge.`, label: 'Required approval missing', action: 'Request review', startedAt: approvalMissingSince, exact: entity.approvalRequirementConfidence === 'exact' });
  else if (policyBlocked) candidates.push({ type: 'changes_requested', category: 'blocked', reasonCode: 'policy_blocker', reason: 'Exact repository policy evidence reports a blocker.', label: 'Policy blocker', action: 'Open PR', startedAt: entity.updatedAt, exact: true });

  const openPullRequest = entity.type === 'pull_request' && entity.state === 'open' && !entity.mergedAt;
  const approvalsSatisfied = entity.requiredApprovalCount === 0 || entity.reviewDecision === 'approved' || entity.reviewState === 'approved' && !approvalCountMissing;
  const ready = openPullRequest && !entity.isDraft && entity.mergeability === 'mergeable' && entity.checkState === 'success' && approvalsSatisfied && entity.sourceCompleteness === 'complete' && !mergeConflict && !changesRequested && !policyBlocked && !approvalMissing;
  if (ready) {
    const satisfiedAt = [latest(['check_succeeded'])?.occurredAt, latest(['approved'])?.occurredAt, entity.updatedAt].map(value => validTimestamp(value, context.referenceDate)).filter((value): value is string => Boolean(value)).sort().pop();
    candidates.push({ type: 'ready_not_merged', category: 'ready_to_merge', reasonCode: 'requirements_satisfied', reason: 'Known checks, approvals, and mergeability are satisfied.', label: 'Ready to merge', action: 'Open PR', startedAt: satisfiedAt, exact: true });
  }

  const reviewRequest = latest(['review_requested']);
  const reviewWait = reviewRequest ? businessDaysBetween(reviewRequest.occurredAt, context.referenceDate, context.calendar) : undefined;
  const awaiting = openPullRequest && !entity.isDraft && entity.reviewState === 'requested' && (entity.requestedReviewers?.length ?? 0) > 0 && reviewRequest && reviewWait != null && reviewWait >= context.reviewWaitDays;
  if (awaiting) candidates.push({ type: 'waiting_for_review', category: 'awaiting_review', reasonCode: 'outstanding_review_request', reason: `Review was requested ${Math.ceil(reviewWait!)} business days ago and no satisfying outcome is recorded.`, label: `Awaiting review for ${Math.ceil(reviewWait!)} days`, action: 'Open PR', startedAt: reviewRequest!.occurredAt, exact: reviewRequest!.sourceCompleteness === 'complete' });

  const active = !context.currentState.terminal && ['pull_request', 'issue', 'branch'].includes(entity.type);
  if (active && context.idleAge != null && context.idleAge >= context.staleDays) candidates.push({ type: entity.isDraft ? 'stale_draft' : 'stale_branch', category: 'stale', reasonCode: 'meaningful_activity_stale', reason: `No meaningful activity has been observed for ${Math.ceil(context.idleAge)} business days.`, label: `Stale for ${Math.ceil(context.idleAge)} days`, action: entity.type === 'pull_request' ? 'Open PR' : 'Open item', startedAt: context.events[context.events.length - 1]?.occurredAt ?? entity.updatedAt, exact: entity.sourceCompleteness === 'complete' });

  return candidates;
}

function actionabilityRank(entity: DeliveryEntity, repository: AnalyticsRepository): number {
  const flags = entity.viewerRelationship?.flags ?? [];
  if (entity.viewerRelationship?.directResponsibility || flags.includes('assigned_to_viewer') || flags.includes('review_requested_from_viewer')) return 0;
  if (flags.includes('authored_by_viewer')) return 1;
  if (flags.includes('viewer_maintains_base_repository') || ['ADMIN', 'MAINTAIN', 'WRITE'].includes(repository.viewerPermission ?? '')) return 2;
  return 3;
}

export function compareDeliveryRiskPriority(a: InventoryItem, b: InventoryItem): number {
  return RISK_SEVERITY[a.riskCategory] - RISK_SEVERITY[b.riskCategory]
    || a.actionableRank - b.actionableRank
    || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
    || (b.ageBusinessDays ?? -1) - (a.ageBusinessDays ?? -1)
    || (a.canonicalKey ?? a.id).localeCompare(b.canonicalKey ?? b.id);
}

export function deliveryRiskInventoryAnalysis(dataset: AnalyticsDataset, settings: AnalyticsSettings): DeliveryRiskInventoryAnalysis {
  const repositoryMap = new Map(includedRepositories(dataset, settings).map(repository => [canonicalRepositoryIdentity(repository.id), repository]));
  const calendar = calendarFromSettings(settings);
  const aggregate = new Map<string, { canonicalKey: string; entity: DeliveryEntity; checkObservedAt: string; evidenceEntityIds: Set<string> }>();
  const pullRequestByBranch = new Map(dataset.entities.filter(entity => entity.type === 'pull_request' && entity.branchName).map(entity => [`${canonicalRepositoryIdentity(entity.repositoryId)}:${entity.branchName!.toLowerCase()}`, entity]));
  dataset.entities.forEach(entity => {
    const linked = entity.type === 'workflow_run' || entity.type === 'check_run'
      ? pullRequestByBranch.get(`${canonicalRepositoryIdentity(entity.repositoryId)}:${entity.branchName?.toLowerCase()}`)
      : undefined;
    const target = linked ?? entity;
    const repositoryIdentity = repositoryMap.get(canonicalRepositoryIdentity(target.repositoryId))?.databaseId ?? canonicalRepositoryIdentity(target.repositoryId);
    const stableWorkflowIdentity = entity.workflowId ?? entity.workflowPath ?? entity.title.toLowerCase();
    const identity = target.number != null && ['issue', 'pull_request'].includes(target.type) ? `${repositoryIdentity}:${target.type}:${target.number}`
      : linked ? `${repositoryIdentity}:${target.type}:${target.id}`
      : entity.type === 'workflow_run' || entity.type === 'check_run'
        ? `${repositoryIdentity}:automation:${stableWorkflowIdentity}:${entity.branchName?.toLowerCase() ?? 'unlinked'}`
        : `${repositoryIdentity}:${target.type}:${target.branchName?.toLowerCase() ?? target.id}`;
    const current = aggregate.get(identity);
    if (!current) {
      aggregate.set(identity, { canonicalKey: identity, entity: { ...target, workflowId: entity.workflowId ?? target.workflowId, workflowPath: entity.workflowPath ?? target.workflowPath, runId: entity.runId ?? target.runId, evidence: [...(target.evidence ?? []), ...(linked && linked.id !== entity.id ? entity.evidence ?? [] : [])], checkState: entity.checkState ?? target.checkState }, checkObservedAt: entity.checkState ? entity.updatedAt : target.updatedAt, evidenceEntityIds: new Set([entity.id]) });
      return;
    }
    if (linked) current.evidenceEntityIds.delete(target.id);
    current.evidenceEntityIds.add(entity.id);
    const checkIsNewer = Boolean(entity.checkState) && entity.updatedAt >= current.checkObservedAt;
    const authoritativeEntity = current.entity.updatedAt >= target.updatedAt ? current.entity : target;
    aggregate.set(identity, { ...current, checkObservedAt: checkIsNewer ? entity.updatedAt : current.checkObservedAt, entity: {
      ...current.entity, ...authoritativeEntity,
      checkState: checkIsNewer ? entity.checkState : current.entity.checkState,
      runId: checkIsNewer ? entity.runId ?? current.entity.runId : current.entity.runId,
      evidence: [...new Set([...(current.entity.evidence ?? []), ...(entity.evidence ?? [])])],
      sourceCompleteness: current.entity.sourceCompleteness === 'complete' && entity.sourceCompleteness === 'complete' ? 'complete' : 'partial',
    } });
  });
  let terminalEntityCount = 0;
  let activeWithoutRiskCount = 0;
  let policyExcludedCount = 0;
  const canonicalGroups = [...aggregate.values()].filter(group => repositoryMap.has(canonicalRepositoryIdentity(group.entity.repositoryId)));
  const items = canonicalGroups.flatMap(group => {
    const entity = group.entity;
    const baseRepository = repositoryMap.get(canonicalRepositoryIdentity(entity.repositoryId));
    if (!baseRepository) return [];
    const effective = effectiveRepositorySettings(settings, baseRepository.id);
    const repository = { ...baseRepository, releaseMatching: effective.releaseMatching ?? baseRepository.releaseMatching, deploymentMatching: effective.deploymentMatching ?? baseRepository.deploymentMatching };
    const thresholds = effective.inventoryThresholds;
    const events = dataset.events
      .filter(event => group.evidenceEntityIds.has(event.entityId) || event.entityId === entity.id)
      .filter(event => !event.observationOnly)
      .filter(event => MEANINGFUL_EVENTS.has(event.type))
      .flatMap(event => validTimestamp(event.occurredAt, dataset.referenceDate) ? [{ ...event, occurredAt: validTimestamp(event.occurredAt, dataset.referenceDate)! }] : [])
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const branchDeleted = entity.type === 'branch' && dataset.branches.some(branch => branch.repositoryId === entity.repositoryId && branch.name === entity.branchName && branch.deletedAt);
    const currentState = resolveCanonicalEntityState(entity, events, dataset.referenceDate, branchDeleted);
    const actor = entity.actorClassification ?? classifyActor(entity.author, entity.isBot);
    if (!isActorIncluded(actor, { includeBots: settings.includeBots, includeDependabot: settings.includeDependabot, includeRenovate: settings.includeRenovate, includeOtherBots: settings.includeOtherBots })) { if (currentState.terminal) terminalEntityCount += 1; else policyExcludedCount += 1; return []; }
    const lastEvent = events[events.length - 1];
    const lastActivityAt = lastEvent?.occurredAt ?? validTimestamp(entity.updatedAt, dataset.referenceDate) ?? validTimestamp(entity.createdAt, dataset.referenceDate);
    const idleAge = lastActivityAt ? businessDaysBetween(lastActivityAt, dataset.referenceDate, calendar) : undefined;
    if (entity.type === 'branch' && (idleAge == null || idleAge < thresholds.staleDays)) { activeWithoutRiskCount += 1; return []; }
    const activity = classifyActivity(entity, { referenceTime: dataset.referenceDate, activeWindowDays: Math.max(30, thresholds.staleDays * 3), agingDays: thresholds.agingDays, staleDays: thresholds.staleDays });
    if (entity.type === 'branch' && !['stale', 'dormant'].includes(activity)) { activeWithoutRiskCount += 1; return []; }
    const candidates = riskCandidates(entity, repository, { idleAge, staleDays: thresholds.staleDays, reviewWaitDays: thresholds.reviewWaitDays ?? thresholds.agingDays, events, referenceDate: dataset.referenceDate, retentionStart: Date.parse(dataset.referenceDate) - settings.cacheRetentionDays * DAY, calendar, currentState });
    if (candidates.length === 0) { if (currentState.terminal) terminalEntityCount += 1; else activeWithoutRiskCount += 1; return []; }
    const sortedCandidates = [...candidates].sort((a, b) => RISK_SEVERITY[a.category] - RISK_SEVERITY[b.category]);
    const candidate = sortedCandidates[0];
    const relationshipIds = dataset.relationships
      .filter(relationship => relationship.sourceId === entity.id || relationship.targetId === entity.id)
      .map(relationship => relationship.sourceId === entity.id ? relationship.targetId : relationship.sourceId);
    const failures = events.filter(event => ['check_failed', 'workflow_failed'].includes(event.type));
    const owner = candidate.category === 'awaiting_review' ? entity.requestedReviewers?.[0] : entity.assignees?.[0] ?? entity.author;
    const riskSince = validTimestamp(candidate.startedAt, dataset.referenceDate);
    const riskAgeBusinessDays = riskSince ? businessDaysBetween(riskSince, dataset.referenceDate, calendar) : undefined;
    const confidence = candidate.reasonCode === 'required_approval_missing' && entity.approvalRequirementConfidence === 'partial' || candidate.reasonCode === 'changes_requested' && !candidate.actor ? 'partial' : candidate.exact && entity.sourceCompleteness === 'complete' ? 'exact' : candidate.exact || entity.sourceCompleteness === 'partial' ? 'partial' : 'unavailable';
    const isBotCreated = ['dependabot', 'renovate', 'other_bot'].includes(actor);
    const elevatedBot = isBotCreated && candidate.exact && ['delivery_blocked', 'blocked'].includes(candidate.category);
    const backlog = candidate.category === 'delivery_status_unknown' ? 'informational' : isBotCreated && !elevatedBot ? 'bot' : repository.archived || (riskAgeBusinessDays ?? idleAge ?? 0) > 180 ? 'legacy' : 'active';
    const canonicalId = `delivery-risk:${group.canonicalKey}`;
    const legacyCanonical = uniqueWorkItemIdentity(entity);
    return [{
      id: canonicalId,
      entity,
      repository,
      type: candidate.type,
      stage: entity.stage,
      ageBusinessDays: riskAgeBusinessDays,
      ageBand: ageBandForDays(riskAgeBusinessDays ?? 0, thresholds),
      lastActivityAt,
      blockingReason: candidate.reason,
      relatedEntityIds: relationshipIds,
      confidence,
      entityType: entity.type,
      inventoryReason: candidate.reason,
      evidenceCount: group.evidenceEntityIds.size,
      firstFailureAt: failures[0]?.occurredAt,
      latestFailureAt: failures[failures.length - 1]?.occurredAt,
      missingEvidence: entity.missingEvidence,
      latestRunStatus: entity.checkState,
      resolutionRule: entity.type === 'workflow_run' || entity.type === 'check_run' ? 'A newer successful run for the same workflow and branch resolves this condition.' : 'Newer canonical lifecycle evidence resolves this condition.',
      canonicalKey: group.canonicalKey,
      riskCategory: candidate.category,
      riskLabel: candidate.label,
      riskReasonCode: candidate.reasonCode,
      secondaryRisks: [...new Set(sortedCandidates.slice(1).map(value => value.category))],
      owner,
      suggestedAction: candidate.action,
      riskSince,
      riskActor: candidate.actor,
      riskEvidenceId: candidate.evidenceId,
      lastActivityLabel: lastEvent ? lastEvent.type.replace(/_/g, ' ') : 'item updated',
      lastActivityActor: lastEvent?.actor,
      checksState: normalizedChecks(entity),
      reviewSummaryState: normalizedReview(entity),
      mergeability: entity.mergeability ?? 'unknown',
      deliveryState: candidate.category === 'delivery_blocked' ? 'blocked' : entity.releasedAt ? 'released' : entity.deployedAt ? 'deployed' : repository.releaseMatching || repository.deploymentMatching ? 'unknown' : 'not_applicable',
      isBotCreated,
      backlog,
      actionableRank: actionabilityRank(entity, repository),
      legacyMuteIds: [`inventory:${group.canonicalKey}:${candidate.type}`, `inventory:${legacyCanonical}:${candidate.type}`],
    } satisfies InventoryItem];
  }).sort(compareDeliveryRiskPriority);
  return { items, canonicalEntityCount: canonicalGroups.length, classifiedRiskCount: items.length, terminalEntityCount, activeWithoutRiskCount, policyExcludedCount };
}

export function inventoryItems(dataset: AnalyticsDataset, settings: AnalyticsSettings): InventoryItem[] {
  return deliveryRiskInventoryAnalysis(dataset, settings).items;
}

const LEAD_TIME_FIELDS: Record<LeadTimeMetric, [keyof DeliveryEntity, keyof DeliveryEntity]> = {
  issue_to_pr: ['createdAt', 'prOpenedAt'],
  pr_to_review: ['prOpenedAt', 'firstReviewAt'],
  pr_to_merge: ['prOpenedAt', 'mergedAt'],
  commit_to_merge: ['firstCommitAt', 'mergedAt'],
  merge_to_deploy: ['mergedAt', 'deployedAt'],
  release_to_deploy: ['releasedAt', 'deployedAt'],
  issue_to_release: ['createdAt', 'releasedAt'],
  issue_to_deploy: ['createdAt', 'deployedAt'],
};

export function leadTimeSamples(dataset: AnalyticsDataset, metric: LeadTimeMetric, repositoryId?: string): LeadTimeSample[] {
  const [startField, endField] = LEAD_TIME_FIELDS[metric];
  return dataset.entities.flatMap(entity => {
    if (repositoryId && entity.repositoryId !== repositoryId) return [];
    const start = entity[startField];
    const end = entity[endField];
    if (typeof start !== 'string' || typeof end !== 'string') return [];
    const hours = (new Date(end).getTime() - new Date(start).getTime()) / (60 * 60 * 1000);
    if (!Number.isFinite(hours) || hours < 0) return [];
    return [{ entityId: entity.id, repositoryId: entity.repositoryId, metric, hours, estimated: entity.sourceCompleteness !== 'complete' }];
  });
}

export interface ThroughputBucket {
  date: string;
  merged: number;
  issuesClosed: number;
  releases: number;
  deployments: number;
}

export function throughputBuckets(dataset: AnalyticsDataset, rangeDays: number, repositoryId?: string, grouping: boolean | number = false): ThroughputBucket[] {
  const end = new Date(dataset.referenceDate).getTime();
  const start = end - rangeDays * DAY;
  const span = typeof grouping === 'number' ? Math.max(1, grouping) : grouping ? 7 : 1;
  const buckets = Array.from({ length: Math.ceil(rangeDays / span) }, (_, index) => ({
    date: new Date(start + index * span * DAY).toISOString().slice(0, 10),
    merged: 0,
    issuesClosed: 0,
    releases: 0,
    deployments: 0,
  }));
  const entityMap = new Map(dataset.entities.map(entity => [entity.id, entity]));
  const seen = new Set<string>();
  dataset.events.forEach(event => {
    if (repositoryId && event.repositoryId !== repositoryId) return;
    const timestamp = new Date(event.occurredAt).getTime();
    const index = Math.floor((timestamp - start) / (span * DAY));
    if (index < 0 || index >= buckets.length) return;
    const entity = entityMap.get(event.entityId);
    const increment = (kind: keyof Omit<ThroughputBucket, 'date'>) => {
      const key = `${index}:${kind}:${event.entityId}`;
      if (!seen.has(key)) { seen.add(key); buckets[index][kind] += 1; }
    };
    if (event.type === 'merged') increment('merged');
    if (event.type === 'closed' && entity?.type === 'issue') increment('issuesClosed');
    if (event.type === 'released') increment('releases');
    if (event.type === 'deployment_succeeded') increment('deployments');
  });
  return buckets;
}

export interface FlowSnapshot {
  date: string;
  issues: number;
  coding: number;
  pullRequests: number;
  review: number;
  checks: number;
  ready: number;
  merged: number;
  deployed: number;
  released: number;
}

function eventStage(type: DeliveryEvent['type']): keyof Omit<FlowSnapshot, 'date'> | null {
  if (type === 'opened') return 'pullRequests';
  if (type === 'committed' || type === 'converted_to_draft') return 'coding';
  if (['review_requested', 'review_submitted', 'approved', 'changes_requested'].includes(type)) return type === 'approved' ? 'ready' : 'review';
  if (type.startsWith('check_') || type.startsWith('workflow_')) return type.endsWith('succeeded') ? null : 'checks';
  if (type === 'merged') return 'merged';
  if (type === 'released') return 'released';
  if (type === 'deployment_succeeded') return 'deployed';
  return null;
}

function stageAt(entity: DeliveryEntity, entityIds: Set<string>, events: DeliveryEvent[], timestamp: number, createdAt: string): keyof Omit<FlowSnapshot, 'date'> | null {
  if (new Date(createdAt).getTime() > timestamp) return null;
  let stage: keyof Omit<FlowSnapshot, 'date'> = entity.type === 'issue' ? 'issues' : entity.firstCommitAt && new Date(entity.firstCommitAt).getTime() <= timestamp ? 'coding' : 'pullRequests';
  const history = events.filter(event => entityIds.has(event.entityId) && new Date(event.occurredAt).getTime() <= timestamp).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const event of history) {
    const explicit = event.stage === 'pull_requests' ? 'pullRequests' : event.stage && event.stage !== 'closed' ? event.stage as keyof Omit<FlowSnapshot, 'date'> : undefined;
    const next = explicit ?? eventStage(event.type);
    if (next) stage = next;
  }
  return stage;
}

export function cumulativeFlow(dataset: AnalyticsDataset, rangeDays: number, repositoryId?: string): FlowSnapshot[] {
  const end = new Date(dataset.referenceDate).getTime();
  const linkedIssueToPr = new Map(dataset.relationships.filter(relationship => relationship.kind === 'implemented_by').map(relationship => [relationship.sourceId, relationship.targetId]));
  const work = dataset.entities.filter(entity => ['issue', 'pull_request'].includes(entity.type) && (!repositoryId || entity.repositoryId === repositoryId)).flatMap(entity => linkedIssueToPr.has(entity.id) ? [] : [{ entity, entityIds: new Set([entity.id]), createdAt: entity.createdAt }]);
  for (const [issueId, prId] of linkedIssueToPr) {
    const issue = dataset.entities.find(entity => entity.id === issueId);
    const pr = dataset.entities.find(entity => entity.id === prId);
    if (!pr || repositoryId && pr.repositoryId !== repositoryId) continue;
    const existing = work.find(item => item.entity.id === pr.id);
    if (existing) { existing.entityIds.add(issueId); if (issue && issue.createdAt < existing.createdAt) existing.createdAt = issue.createdAt; }
  }
  return Array.from({ length: rangeDays }, (_, index) => {
    const timestamp = end - (rangeDays - index - 1) * DAY;
    const snapshot: FlowSnapshot = { date: new Date(timestamp).toISOString().slice(0, 10), issues: 0, coding: 0, pullRequests: 0, review: 0, checks: 0, ready: 0, merged: 0, deployed: 0, released: 0 };
    work.forEach(({ entity, entityIds, createdAt }) => {
      const stage = stageAt(entity, entityIds, dataset.events, timestamp, createdAt);
      if (stage) snapshot[stage] += 1;
    });
    return snapshot;
  });
}

export function timelineForEntity(dataset: AnalyticsDataset, entityId: string): AnalyticsInspectable['timeline'] {
  return dataset.events.filter(event => event.entityId === entityId && !event.observationOnly).map(event => ({
    label: event.type.replace(/_/g, ' '),
    occurredAt: event.occurredAt,
    confidence: event.sourceCompleteness === 'complete' ? 'exact' : 'inferred',
  }));
}

export function inventoryInspectable(dataset: AnalyticsDataset, item: InventoryItem): AnalyticsInspectable {
  return {
    id: item.id,
    kind: 'inventory',
    title: item.entity.title,
    repositoryId: item.repository.id,
    number: item.entity.number,
    url: item.entity.url,
    state: item.entity.state,
    occurredAt: item.lastActivityAt,
    reason: item.blockingReason,
    confidence: item.confidence,
    evidence: [...(item.entity.evidence ?? []), `Check state: ${item.latestRunStatus ?? 'unknown'}`, `Review state: ${item.entity.reviewState ?? 'unknown'}`, `Evidence records: ${item.evidenceCount}`],
    missingEvidence: item.missingEvidence,
    relatedEntityIds: item.relatedEntityIds,
    sampleCount: item.evidenceCount,
    definition: item.inventoryReason,
    coverage: dataset.partial ? 'partial' : 'complete',
    timeline: timelineForEntity(dataset, item.entity.id),
    riskCategory: item.riskCategory,
    riskLabel: item.riskLabel,
    riskAgeDays: item.ageBusinessDays,
    secondaryRisks: item.secondaryRisks,
    checksState: item.checksState,
    reviewSummaryState: item.reviewSummaryState,
    mergeability: item.mergeability,
    deliveryState: item.deliveryState,
    lastActivityLabel: item.lastActivityLabel,
    lastActivityActor: item.lastActivityActor,
    owner: item.owner,
    riskActor: item.riskActor,
    riskStartedAt: item.riskSince,
    reviewDecision: item.entity.reviewDecision,
    mergeStateStatus: item.entity.mergeStateStatus,
    requiredApprovalCount: item.entity.requiredApprovalCount,
    qualifyingApprovalCount: item.entity.qualifyingApprovalCount,
    latestSnapshotAt: item.entity.latestSnapshotAt,
    suggestedAction: item.suggestedAction,
    entityType: item.entityType,
    runId: item.entity.runId,
  };
}

export function ageBandCounts(items: InventoryItem[]): Record<AgeBand, number> {
  return items.reduce((counts, item) => ({ ...counts, [item.ageBand]: counts[item.ageBand] + 1 }), { in_flight: 0, aging: 0, stale: 0 });
}

export function normalWip(dataset: AnalyticsDataset): number {
  const snapshots = cumulativeFlow(dataset, 60);
  const concurrent = snapshots.map(snapshot => snapshot.coding + snapshot.pullRequests + snapshot.review + snapshot.checks + snapshot.ready);
  return Math.max(1, Math.round(median(concurrent) ?? 1));
}
