import type {
  AnalyticsDataset,
  AnalyticsRepository,
  DeliveryBranch,
  DeliveryEntity,
  DeliveryEvent,
  DeliveryRelationship,
} from './types';
import { buildDeliveryLineage } from './lineage';

export const DEMO_ANALYTICS_REFERENCE_DATE = '2026-06-21T12:00:00.000Z';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const REFERENCE = new Date(DEMO_ANALYTICS_REFERENCE_DATE).getTime();

function at(daysAgo: number, hourOffset = 0): string {
  return new Date(REFERENCE - daysAgo * DAY + hourOffset * HOUR).toISOString();
}

const repositories: AnalyticsRepository[] = [
  { id: 'nova-labs/snow-devil', nameWithOwner: 'nova-labs/snow-devil', defaultBranch: 'main', releaseMatching: true, deploymentMatching: true },
  { id: 'nova-labs/edge-runtime', nameWithOwner: 'nova-labs/edge-runtime', defaultBranch: 'main', releaseMatching: true, deploymentMatching: true },
  { id: 'nova-labs/data-pipeline', nameWithOwner: 'nova-labs/data-pipeline', defaultBranch: 'trunk', releaseMatching: false, deploymentMatching: true, capabilityNote: 'Deployments are tracked; releases are not used.' },
  { id: 'nova-labs/old-prototype', nameWithOwner: 'nova-labs/old-prototype', defaultBranch: 'main', archived: false, releaseMatching: false, deploymentMatching: false, capabilityNote: 'No release or deployment evidence is available.' },
];

function event(entity: DeliveryEntity, type: DeliveryEvent['type'], occurredAt: string, stage = entity.stage): DeliveryEvent {
  return {
    id: `${entity.id}:${type}:${occurredAt}`,
    entityId: entity.id,
    repositoryId: entity.repositoryId,
    type,
    occurredAt,
    stage,
    actor: entity.author,
    sourceCompleteness: entity.sourceCompleteness,
  };
}

export function createDemoAnalyticsDataset(): AnalyticsDataset {
  const entities: DeliveryEntity[] = [];
  const events: DeliveryEvent[] = [];
  const relationships: DeliveryRelationship[] = [];
  const branches: DeliveryBranch[] = [];

  repositories.forEach((repository, repositoryIndex) => {
    const completedCount = repositoryIndex === 0 ? 22 : repositoryIndex === 1 ? 18 : repositoryIndex === 2 ? 13 : 8;
    for (let index = 0; index < completedCount; index += 1) {
      const number = repositoryIndex * 1000 + index + 101;
      const openedDaysAgo = 89 - index * (78 / Math.max(1, completedCount - 1));
      const issueOpened = at(openedDaysAgo);
      const firstCommit = at(openedDaysAgo - 0.4, repositoryIndex * 2);
      const prOpened = at(openedDaysAgo - 0.9, index % 4);
      const firstReview = at(openedDaysAgo - 1.25, index % 6);
      const merged = at(openedDaysAgo - (1.7 + (index % 5) * 0.45));
      const deployed = repository.deploymentMatching && index % 4 !== 1 ? at(openedDaysAgo - (2.4 + (index % 4) * 0.4)) : undefined;
      const released = repository.releaseMatching && index % 5 !== 2 ? at(openedDaysAgo - (3.1 + (index % 3) * 0.6)) : undefined;
      const issueId = `${repository.id}:issue:${number}`;
      const prId = `${repository.id}:pr:${number}`;
      const issue: DeliveryEntity = {
        id: issueId,
        repositoryId: repository.id,
        type: 'issue',
        number,
        title: `Deliver analytics increment ${number}`,
        stage: released ? 'released' : deployed ? 'deployed' : 'merged',
        state: 'closed',
        author: 'snowdevil-demo',
        createdAt: issueOpened,
        updatedAt: released ?? deployed ?? merged,
        closedAt: merged,
        releasedAt: released,
        deployedAt: deployed,
        sourceCompleteness: index % 11 === 0 ? 'partial' : 'complete',
        evidence: ['Issue and pull request explicitly linked'],
      };
      const pr: DeliveryEntity = {
        id: prId,
        repositoryId: repository.id,
        type: 'pull_request',
        number,
        title: `Implement analytics increment ${number}`,
        stage: released ? 'released' : deployed ? 'deployed' : 'merged',
        state: 'merged',
        author: 'snowdevil-demo',
        createdAt: prOpened,
        updatedAt: released ?? deployed ?? merged,
        firstCommitAt: firstCommit,
        prOpenedAt: prOpened,
        firstReviewAt: firstReview,
        mergedAt: merged,
        deployedAt: deployed,
        releasedAt: released,
        branchName: `feature/${number}-analytics`,
        baseBranch: repository.defaultBranch,
        reviewState: 'approved',
        checkState: 'success',
        sourceCompleteness: issue.sourceCompleteness,
        evidence: ['Merge commit and check suite head SHA matched'],
      };
      entities.push(issue, pr);
      events.push(
        event(issue, 'opened', issueOpened, 'issues'),
        event(issue, 'closed', merged, 'merged'),
        event(pr, 'committed', firstCommit, 'coding'),
        event(pr, 'opened', prOpened, 'pull_requests'),
        event(pr, 'review_requested', prOpened, 'review'),
        event(pr, 'approved', firstReview, 'review'),
        event(pr, 'check_succeeded', new Date(new Date(firstReview).getTime() + 2 * HOUR).toISOString(), 'checks'),
        event(pr, 'merged', merged, 'merged'),
      );
      if (deployed) events.push(event(pr, 'deployment_succeeded', deployed, 'deployed'));
      if (released) events.push(event(pr, 'released', released, 'released'));
      relationships.push({
        id: `${issueId}->${prId}`,
        sourceId: issueId,
        targetId: prId,
        kind: 'implemented_by',
        confidence: 'exact',
        evidence: 'Explicit linked pull request and closing issue reference',
      });
      branches.push({
        id: `${repository.id}:branch:${number}`,
        repositoryId: repository.id,
        name: pr.branchName!,
        firstObservedAt: firstCommit,
        lastActivityAt: merged,
        mergedAt: merged,
        deletedAt: new Date(new Date(merged).getTime() + HOUR).toISOString(),
        defaultBranch: false,
        estimated: index % 9 === 0,
      });
    }
  });

  const current: DeliveryEntity[] = [
    { id: 'focus:review', repositoryId: repositories[0].id, type: 'pull_request', number: 4213, title: 'Implement offline analytics cache', stage: 'review', state: 'open', author: 'snowdevil-demo', createdAt: at(6), updatedAt: at(2), prOpenedAt: at(6), firstCommitAt: at(7), reviewState: 'requested', checkState: 'success', requestedReviewers: ['octo-reviewer'], sourceCompleteness: 'complete', evidence: ['Review requested from octo-reviewer'] },
    { id: 'focus:changes', repositoryId: repositories[0].id, type: 'pull_request', number: 12028, title: 'Fix buffer overflow in parser', stage: 'review', state: 'open', author: 'snowdevil-demo', createdAt: at(5), updatedAt: at(3), prOpenedAt: at(5), reviewState: 'changes_requested', checkState: 'success', sourceCompleteness: 'complete', evidence: ['Changes requested on your pull request'] },
    { id: 'focus:failed', repositoryId: repositories[1].id, type: 'pull_request', number: 3273, title: 'Refactor authentication module', stage: 'checks', state: 'open', author: 'snowdevil-demo', createdAt: at(4), updatedAt: at(1), prOpenedAt: at(4), reviewState: 'approved', checkState: 'failure', sourceCompleteness: 'complete', evidence: ['Required check failed'] },
    { id: 'focus:draft', repositoryId: repositories[2].id, type: 'pull_request', number: 2593, title: 'Add telemetry events', stage: 'pull_requests', state: 'draft', author: 'snowdevil-demo', createdAt: at(17), updatedAt: at(16), prOpenedAt: at(17), isDraft: true, reviewState: 'none', checkState: 'unknown', sourceCompleteness: 'partial', evidence: ['Draft pull request inactive for 16 days'] },
    { id: 'focus:ready', repositoryId: repositories[1].id, type: 'pull_request', number: 8301, title: 'Harden repository sync retries', stage: 'ready', state: 'open', author: 'snowdevil-demo', createdAt: at(3), updatedAt: at(1), prOpenedAt: at(3), firstReviewAt: at(2), reviewState: 'approved', checkState: 'success', sourceCompleteness: 'complete', evidence: ['Approved with all required checks passing'] },
    { id: 'focus:coding', repositoryId: repositories[0].id, type: 'branch', title: 'feature/accessibility-audit', stage: 'coding', state: 'active', author: 'snowdevil-demo', createdAt: at(2), updatedAt: at(0.5), firstCommitAt: at(2), branchName: 'feature/accessibility-audit', baseBranch: 'main', sourceCompleteness: 'complete', evidence: ['Unique commits observed on a non-default branch'] },
    { id: 'inventory:merged-release', repositoryId: repositories[0].id, type: 'pull_request', number: 9104, title: 'Add cached deployment summary', stage: 'merged', state: 'merged', author: 'snowdevil-demo', createdAt: at(9), updatedAt: at(7), prOpenedAt: at(9), mergedAt: at(7), reviewState: 'approved', checkState: 'success', sourceCompleteness: 'complete', evidence: ['Merged commit has no matching release tag'] },
    { id: 'inventory:merged-deploy', repositoryId: repositories[1].id, type: 'pull_request', number: 9105, title: 'Improve incremental refresh', stage: 'merged', state: 'merged', author: 'snowdevil-demo', createdAt: at(15), updatedAt: at(11), prOpenedAt: at(15), mergedAt: at(11), reviewState: 'approved', checkState: 'success', sourceCompleteness: 'complete', evidence: ['Merged commit has no matching deployment SHA'] },
    { id: 'inventory:deployed-release', repositoryId: repositories[0].id, type: 'deployment', title: 'Production deployment 9106', stage: 'deployed', state: 'success', author: 'snowdevil-demo', createdAt: at(17), updatedAt: at(14), deployedAt: at(14), sourceCompleteness: 'complete', evidence: ['Deployment succeeded; no release targets this SHA'] },
    { id: 'inventory:closed', repositoryId: repositories[3].id, type: 'pull_request', number: 77, title: 'Retire legacy experiment', stage: 'closed', state: 'closed', author: 'snowdevil-demo', createdAt: at(22), updatedAt: at(15), closedAt: at(15), reviewState: 'none', checkState: 'unknown', sourceCompleteness: 'partial', evidence: ['Closed without merge evidence'] },
  ];
  entities.push(...current);
  current.forEach(entity => {
    events.push(event(entity, 'opened', entity.createdAt, entity.stage));
    if (entity.reviewState === 'requested') events.push(event(entity, 'review_requested', entity.updatedAt, 'review'));
    if (entity.reviewState === 'changes_requested') events.push(event(entity, 'changes_requested', entity.updatedAt, 'review'));
    if (entity.checkState === 'failure') events.push(event(entity, 'check_failed', entity.updatedAt, 'checks'));
    if (entity.mergedAt) events.push(event(entity, 'merged', entity.mergedAt, 'merged'));
    if (entity.deployedAt) events.push(event(entity, 'deployment_succeeded', entity.deployedAt, 'deployed'));
    if (entity.closedAt && entity.state === 'closed') events.push(event(entity, 'closed', entity.closedAt, 'closed'));
  });

  const activeBranchSpecs = [
    [repositories[0].id, 'feature/compact-heatmap', 0.4],
    [repositories[1].id, 'feature/retry-policy', 1.1],
    [repositories[2].id, 'feature/warehouse-backfill', 2.5],
    [repositories[2].id, 'feature/slow-query-trace', 3.2],
    [repositories[3].id, 'experiment/old-renderer', 18],
    [repositories[3].id, 'experiment/unused-cache', 24],
    [repositories[3].id, 'experiment/abandoned-api', 31],
  ] as const;
  activeBranchSpecs.forEach(([repositoryId, name, daysAgo], index) => branches.push({
    id: `${repositoryId}:active:${index}`,
    repositoryId,
    name,
    firstObservedAt: at(daysAgo),
    lastActivityAt: at(Math.max(0.1, daysAgo - 0.2)),
    defaultBranch: false,
    estimated: index % 3 === 0,
  }));

  entities.push({ id: 'inventory:stale-branch', repositoryId: repositories[3].id, type: 'branch', title: 'experiment/old-renderer', branchName: 'experiment/old-renderer', stage: 'coding', state: 'active', author: 'snowdevil-demo', createdAt: at(18), updatedAt: at(17), sourceCompleteness: 'partial', evidence: ['First unique commit observed 18 days ago', 'No merge or deletion evidence'] });

  const integrationCadence = [1, 3, 4, 9];
  repositories.forEach((repository, repositoryIndex) => {
    for (let daysAgo = 0; daysAgo < 84; daysAgo += integrationCadence[repositoryIndex]) {
      if (repositoryIndex === 3 && daysAgo < 12) continue;
      const directPush = daysAgo % (repositoryIndex + 4) === 0;
      events.push({
        id: `${repository.id}:integration:${daysAgo}`,
        entityId: `${repository.id}:default-branch`,
        repositoryId: repository.id,
        type: directPush ? 'committed' : 'merged',
        occurredAt: at(daysAgo, 3),
        stage: 'merged',
        actor: 'snowdevil-demo',
        directPush,
        sourceCompleteness: 'complete',
      });
    }
  });

  return {
    referenceDate: DEMO_ANALYTICS_REFERENCE_DATE,
    refreshedAt: DEMO_ANALYTICS_REFERENCE_DATE,
    repositories,
    entities,
    events: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    branches,
    relationships: buildDeliveryLineage(entities, relationships),
    partial: true,
    partialReasons: ['One repository has incomplete release/deployment coverage', 'Some branch start times are estimated from first observed commits'],
  };
}
