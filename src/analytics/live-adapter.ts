import { reconstructState } from '../simulator/simulator-reducer';
import type { SimulatorEvent } from '../simulator/simulator-types';
import type { AnalyticsDataset, AnalyticsRepository, DeliveryBranch, DeliveryEntity, DeliveryEvent } from './types';
import { buildDeliveryLineage } from './lineage';
import { classifyActor, confidenceFromEvidence } from '../lib/delivery-semantics';
import { deriveViewerRelationship, normalizeRepositoryPermission } from '../lib/product-model';
import { canonicalRepositoryIdentity } from '../lib/canonical-identity';

function stringMetadata(event: SimulatorEvent, key: string): string | undefined {
  const value = event.metadata[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function anyStringMetadata(events: SimulatorEvent[], key: string): string | undefined {
  return events.map(event => stringMetadata(event, key)).find(Boolean);
}

function latestMetadata(events: SimulatorEvent[], key: string): unknown {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(event => event.metadata[key]).find(value => value != null);
}

export function analyticsDatasetFromSimulatorEvents(
  simulatorEvents: SimulatorEvent[],
  repositoryRows: Array<{ id: string; databaseId?: string | number; name: string; url?: string; viewerPermission?: string; ownerLogin?: string; fork?: boolean; archived?: boolean; private?: boolean; template?: boolean; empty?: boolean }>,
  referenceDate = new Date().toISOString(),
  viewerLogin?: string,
): AnalyticsDataset {
  const state = Array.from(reconstructState(simulatorEvents, referenceDate).values());
  const repoIds = new Set([...repositoryRows.map(repository => canonicalRepositoryIdentity(repository.id)), ...simulatorEvents.map(event => canonicalRepositoryIdentity(event.repositoryId))]);
  const repositories: AnalyticsRepository[] = Array.from(repoIds).map(id => {
    const row = repositoryRows.find(repository => canonicalRepositoryIdentity(repository.id) === id);
    const repositoryEvents = simulatorEvents.filter(event => canonicalRepositoryIdentity(event.repositoryId) === id);
    const releaseMatching = repositoryEvents.some(event => event.subjectType === 'release' || event.eventType === 'released');
    const deploymentMatching = repositoryEvents.some(event => event.subjectType === 'deployment' || event.eventType.startsWith('deployment_'));
    return { id, databaseId: row?.databaseId, nameWithOwner: row?.name ?? id, url: row?.url, defaultBranch: 'main', archived: row?.archived, fork: row?.fork, private: row?.private, template: row?.template, empty: row?.empty, ownerLogin: row?.ownerLogin ?? (row?.name ?? id).split('/')[0], viewerPermission: normalizeRepositoryPermission(row?.viewerPermission), releaseMatching, deploymentMatching, capabilityNote: !releaseMatching && !deploymentMatching ? 'No explicit release or deployment evidence was observed in cached history.' : undefined };
  });
  const entities: DeliveryEntity[] = state.map(entity => {
    const sourceEvents = simulatorEvents.filter(event => event.subjectId === entity.id && event.repositoryId === entity.repositoryId);
    const first = sourceEvents[0];
    const findDate = (types: SimulatorEvent['eventType'][]) => { const event = sourceEvents.find(value => !value.observationOnly && types.includes(value.eventType)); return event?.sourceOccurredAt ?? event?.occurredAt; };
    const repository = repositories.find(value => canonicalRepositoryIdentity(value.id) === canonicalRepositoryIdentity(entity.repositoryId));
    const author = entity.author?.login;
    return {
      id: `${canonicalRepositoryIdentity(entity.repositoryId)}:${entity.id}`,
      repositoryId: canonicalRepositoryIdentity(entity.repositoryId),
      type: entity.subjectType,
      number: entity.number,
      title: entity.title,
      url: sourceEvents.map(event => stringMetadata(event, 'url')).find(Boolean),
      stage: entity.stage,
      state: entity.status,
      author: entity.author?.login,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      firstCommitAt: findDate(['committed']),
      prOpenedAt: entity.subjectType === 'pull_request' ? findDate(['opened']) : undefined,
      firstReviewAt: findDate(['review_submitted', 'approved', 'changes_requested']),
      mergedAt: entity.mergedAt,
      closedAt: entity.status === 'closed' ? [...sourceEvents].reverse().find(event => event.eventType === 'closed')?.occurredAt ?? entity.updatedAt : undefined,
      deployedAt: entity.deployedAt,
      releasedAt: entity.releasedAt,
      branchName: first ? stringMetadata(first, 'headRefName') ?? stringMetadata(first, 'headBranch') ?? stringMetadata(first, 'ref') : undefined,
      baseBranch: first ? stringMetadata(first, 'baseRefName') : undefined,
      workflowId: anyStringMetadata(sourceEvents, 'workflowId'),
      workflowPath: anyStringMetadata(sourceEvents, 'workflowPath'),
      runId: anyStringMetadata(sourceEvents, 'runId') ?? anyStringMetadata(sourceEvents, 'checkRunId'),
      isDraft: entity.status === 'draft',
      reviewState: entity.reviewState,
      reviewDecision: entity.reviewDecision,
      checkState: entity.checkState,
      mergeStateStatus: entity.mergeStateStatus,
      requiredApprovalCount: entity.requiredApprovalCount,
      qualifyingApprovalCount: entity.qualifyingApprovalCount,
      approvalRequirementConfidence: entity.approvalRequirementConfidence,
      headSha: entity.headSha,
      latestSnapshotAt: entity.latestSnapshotAt,
      mergeability: entity.mergeability ?? (() => { const raw = latestMetadata(sourceEvents, 'mergeability') ?? latestMetadata(sourceEvents, 'mergeable'); const value = typeof raw === 'string' ? raw.toLowerCase() : raw; return value === true || ['mergeable', 'clean', 'unstable', 'has_hooks'].includes(String(value)) ? 'mergeable' : value === false || ['conflicting', 'dirty'].includes(String(value)) ? 'conflicting' : value === 'blocked' ? 'blocked' : value != null ? 'unknown' : undefined; })(),
      requestedReviewers: entity.reviewers.map(reviewer => reviewer.login),
      assignees: entity.assignees.map(assignee => assignee.login),
      sourceCompleteness: entity.sourceCompleteness ?? 'unknown',
      evidence: sourceEvents.map(event => `${event.source}: ${event.eventType} · ${event.occurredAt} · ${event.id}`),
      actorClassification: classifyActor(entity.author?.login),
      confidence: confidenceFromEvidence({ completeness: entity.sourceCompleteness }),
      viewerRelationship: deriveViewerRelationship({ viewerLogin, authorLogin: author, assignees: entity.assignees.map(value => value.login), requestedReviewers: entity.reviewers.map(value => value.login), baseRepository: { nameWithOwner: repository?.nameWithOwner, ownerLogin: repository?.ownerLogin, viewerPermission: repository?.viewerPermission } }),
    };
  });
  const events: DeliveryEvent[] = simulatorEvents.map(event => ({
    id: event.id,
    entityId: `${canonicalRepositoryIdentity(event.repositoryId)}:${event.subjectId}`,
    repositoryId: canonicalRepositoryIdentity(event.repositoryId),
    type: event.eventType,
    occurredAt: event.sourceOccurredAt ?? event.occurredAt,
    sourceOccurredAt: event.sourceOccurredAt ?? event.occurredAt,
    observedAt: event.observedAt,
    persistedAt: event.persistedAt,
    observationOnly: event.observationOnly,
    actor: event.actor?.login,
    directPush: event.subjectType === 'commit' && stringMetadata(event, 'baseRefName') === 'main',
    sourceCompleteness: event.sourceCompleteness,
    checkRunId: stringMetadata(event, 'checkRunId') ?? stringMetadata(event, 'externalId'),
    checkName: stringMetadata(event, 'checkName'),
    requiredCheck: typeof event.metadata.required === 'boolean' ? event.metadata.required : undefined,
  }));
  const branches: DeliveryBranch[] = entities.filter(entity => entity.type === 'branch' || entity.branchName).map(entity => ({
    id: `${entity.id}:branch`,
    repositoryId: entity.repositoryId,
    name: entity.branchName ?? entity.title,
    firstObservedAt: entity.firstCommitAt ?? entity.createdAt,
    lastActivityAt: entity.updatedAt,
    mergedAt: entity.mergedAt,
    deletedAt: entity.state === 'closed' ? entity.updatedAt : undefined,
    defaultBranch: entity.branchName === entity.baseBranch,
    estimated: !entity.firstCommitAt,
  }));
  return {
    referenceDate,
    refreshedAt: referenceDate,
    repositories,
    entities,
    events: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    branches,
    relationships: buildDeliveryLineage(entities),
    partial: true,
    partialReasons: simulatorEvents.length === 0
      ? ['No cached historical events are available. Open a simulator and refresh to populate local history.']
      : ['Live analytics currently use bounded cached simulator history', 'Release/deployment capability is unknown until explicit evidence is observed'],
    rawWorkflowRuns: simulatorEvents.filter(event => event.subjectType === 'workflow_run'),
  };
}
