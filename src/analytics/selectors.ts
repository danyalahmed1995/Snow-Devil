import { ageBandForDays, businessDaysBetween, businessHoursBetween, calendarFromSettings } from './business-time';
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
  LeadTimeMetric,
  LeadTimeSample,
  RepositoryHealth,
} from './types';
import { effectiveRepositorySettings } from '../stores/analytics-settings-store';
import { classifyActivity, classifyActor, confidenceFromEvidence, isActorIncluded, uniqueWorkItemIdentity } from '../lib/delivery-semantics';

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

function inventoryCandidate(entity: DeliveryEntity, repository: AnalyticsRepository): { type: InventoryType; reason: string } | null {
  if (entity.type === 'branch') return { type: 'stale_branch', reason: 'Branch has no recent integration evidence' };
  if (entity.type === 'pull_request' && entity.state === 'closed' && !entity.mergedAt) return { type: 'closed_unmerged', reason: 'Closed without merge evidence' };
  if (entity.type === 'pull_request' && entity.isDraft) return { type: 'stale_draft', reason: 'Draft pull request has prolonged inactivity' };
  if (entity.checkState === 'failure') return { type: 'checks_failing', reason: 'Required checks are failing' };
  if (entity.checkState === 'running' || entity.checkState === 'queued') return { type: 'checks_waiting', reason: 'Checks are pending' };
  if (entity.reviewState === 'changes_requested') return { type: 'changes_requested', reason: 'Changes were requested' };
  if (entity.reviewState === 'requested') return { type: 'waiting_for_review', reason: 'Waiting for requested review' };
  if (entity.stage === 'ready') return { type: 'ready_not_merged', reason: 'Approved and checks complete, but not merged' };
  if (entity.mergedAt && repository.releaseMatching && !entity.releasedAt) return { type: 'merged_not_released', reason: 'Merged, no release found' };
  if (entity.mergedAt && repository.deploymentMatching && !entity.deployedAt) return { type: 'merged_not_deployed', reason: 'Merged, no deployment found' };
  if (entity.deployedAt && repository.releaseMatching && !entity.releasedAt) return { type: 'deployed_not_released', reason: 'Deployment exists, no release found' };
  if (entity.releasedAt && repository.deploymentMatching && !entity.deployedAt) return { type: 'released_not_deployed', reason: 'Release exists, no deployment found' };
  return null;
}

export function inventoryItems(dataset: AnalyticsDataset, settings: AnalyticsSettings): InventoryItem[] {
  const repositoryMap = new Map(includedRepositories(dataset, settings).map(repository => [repository.id, repository]));
  const calendar = calendarFromSettings(settings);
  const aggregate = new Map<string, { canonicalKey: string; entity: DeliveryEntity; checkObservedAt: string; evidenceEntityIds: Set<string> }>();
  dataset.entities.forEach(entity => {
    const linked = entity.type === 'workflow_run' || entity.type === 'check_run'
      ? dataset.entities.find(candidate => candidate.repositoryId === entity.repositoryId && candidate.type === 'pull_request' && entity.branchName && candidate.branchName === entity.branchName)
      : undefined;
    const target = linked ?? entity;
    const stableWorkflowIdentity = entity.workflowId ?? entity.workflowPath ?? entity.title.toLowerCase();
    const identity = linked ? uniqueWorkItemIdentity(target)
      : entity.type === 'workflow_run' || entity.type === 'check_run'
        ? `${entity.repositoryId}:automation:${stableWorkflowIdentity}:${entity.branchName ?? 'unlinked'}`
        : uniqueWorkItemIdentity(target);
    const current = aggregate.get(identity);
    if (!current) {
      aggregate.set(identity, { canonicalKey: identity, entity: { ...target, workflowId: entity.workflowId ?? target.workflowId, workflowPath: entity.workflowPath ?? target.workflowPath, runId: undefined, evidence: [...(target.evidence ?? []), ...(linked && linked.id !== entity.id ? entity.evidence ?? [] : [])], checkState: entity.checkState ?? target.checkState }, checkObservedAt: entity.checkState ? entity.updatedAt : target.updatedAt, evidenceEntityIds: new Set([entity.id]) });
      return;
    }
    if (linked) current.evidenceEntityIds.delete(target.id);
    current.evidenceEntityIds.add(entity.id);
    const checkIsNewer = Boolean(entity.checkState) && entity.updatedAt >= current.checkObservedAt;
    aggregate.set(identity, { ...current, checkObservedAt: checkIsNewer ? entity.updatedAt : current.checkObservedAt, entity: {
      ...current.entity,
      updatedAt: current.entity.updatedAt > entity.updatedAt ? current.entity.updatedAt : entity.updatedAt,
      checkState: checkIsNewer ? entity.checkState : current.entity.checkState,
      evidence: [...new Set([...(current.entity.evidence ?? []), ...(entity.evidence ?? [])])],
      sourceCompleteness: current.entity.sourceCompleteness === 'complete' && entity.sourceCompleteness === 'complete' ? 'complete' : 'partial',
    } });
  });
  return [...aggregate.values()].flatMap(group => {
    const entity = group.entity;
    const baseRepository = repositoryMap.get(entity.repositoryId);
    const actor = entity.actorClassification ?? classifyActor(entity.author, entity.isBot);
    if (!baseRepository || !isActorIncluded(actor, { includeBots: settings.includeBots, includeDependabot: settings.includeDependabot, includeRenovate: settings.includeRenovate })) return [];
    const effective = effectiveRepositorySettings(settings, baseRepository.id);
    const repository = { ...baseRepository, releaseMatching: effective.releaseMatching ?? baseRepository.releaseMatching, deploymentMatching: effective.deploymentMatching ?? baseRepository.deploymentMatching };
    const thresholds = effective.inventoryThresholds;
    if (entity.type === 'branch' && (entity.state === 'closed' || dataset.branches.some(branch => branch.repositoryId === entity.repositoryId && branch.name === entity.branchName && branch.deletedAt))) return [];
    const ageBusinessDays = businessDaysBetween(entity.updatedAt, dataset.referenceDate, calendar);
    if ((entity.type === 'branch' || entity.isDraft) && ageBusinessDays < thresholds.staleDays) return [];
    const activity = classifyActivity(entity, { referenceTime: dataset.referenceDate, activeWindowDays: Math.max(30, thresholds.staleDays * 3), agingDays: thresholds.agingDays, staleDays: thresholds.staleDays });
    if (entity.type === 'branch' && !['stale', 'dormant'].includes(activity)) return [];
    const candidate = inventoryCandidate(entity, repository);
    if (!candidate) return [];
    const relationshipIds = dataset.relationships
      .filter(relationship => relationship.sourceId === entity.id || relationship.targetId === entity.id)
      .map(relationship => relationship.sourceId === entity.id ? relationship.targetId : relationship.sourceId);
    const failures = dataset.events.filter(event => group.evidenceEntityIds.has(event.entityId) && ['check_failed', 'workflow_failed'].includes(event.type));
    return [{
      id: `inventory:${group.canonicalKey}:${candidate.type}`,
      entity,
      repository,
      type: candidate.type,
      stage: entity.stage,
      ageBusinessDays,
      ageBand: ageBandForDays(ageBusinessDays, thresholds),
      lastActivityAt: entity.updatedAt,
      blockingReason: candidate.reason,
      relatedEntityIds: relationshipIds,
      confidence: confidenceFromEvidence({ completeness: entity.sourceCompleteness, linked: entity.type === 'workflow_run' || entity.type === 'check_run' ? false : undefined }),
      entityType: entity.type,
      inventoryReason: candidate.reason,
      evidenceCount: group.evidenceEntityIds.size,
      firstFailureAt: failures[0]?.occurredAt,
      latestFailureAt: failures[failures.length - 1]?.occurredAt,
      missingEvidence: entity.missingEvidence,
      latestRunStatus: entity.checkState,
      resolutionRule: entity.type === 'workflow_run' || entity.type === 'check_run' ? 'A newer successful run for the same workflow and branch resolves this condition.' : 'Newer canonical lifecycle evidence resolves this condition.',
      canonicalKey: group.canonicalKey,
    } satisfies InventoryItem];
  }).sort((a, b) => b.ageBusinessDays - a.ageBusinessDays);
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
  return dataset.events.filter(event => event.entityId === entityId).map(event => ({
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
    evidence: [...(item.entity.evidence ?? []), `Canonical key: ${item.canonicalKey}`, `Evidence records: ${item.evidenceCount}`, `Latest run status: ${item.latestRunStatus ?? 'unavailable'}`, `Resolution rule: ${item.resolutionRule ?? 'Newer canonical evidence supersedes this condition.'}`],
    missingEvidence: item.missingEvidence,
    relatedEntityIds: item.relatedEntityIds,
    sampleCount: item.evidenceCount,
    definition: `${item.inventoryReason}. Repeated workflow, check, and timeline evidence is aggregated under this unique work item.`,
    coverage: dataset.partial ? 'partial' : 'complete',
    timeline: timelineForEntity(dataset, item.entity.id),
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
