import type { DeliveryEntity, DeliveryRelationship, LineageConfidence } from './types';

function relationshipId(sourceId: string, targetId: string, kind: DeliveryRelationship['kind']): string {
  return `${sourceId}->${kind}->${targetId}`;
}

function addRelationship(target: Map<string, DeliveryRelationship>, sourceId: string, targetId: string, kind: DeliveryRelationship['kind'], confidence: LineageConfidence, evidence: string) {
  const id = relationshipId(sourceId, targetId, kind);
  if (!target.has(id)) target.set(id, { id, sourceId, targetId, kind, confidence, evidence });
}

export function buildDeliveryLineage(entities: DeliveryEntity[], existing: DeliveryRelationship[] = []): DeliveryRelationship[] {
  const relationships = new Map(existing.map(relationship => [relationship.id, relationship]));
  const byRepository = new Map<string, DeliveryEntity[]>();
  entities.forEach(entity => byRepository.set(entity.repositoryId, [...(byRepository.get(entity.repositoryId) ?? []), entity]));

  byRepository.forEach(repositoryEntities => {
    const issues = repositoryEntities.filter(entity => entity.type === 'issue');
    const pullRequests = repositoryEntities.filter(entity => entity.type === 'pull_request');
    const branches = repositoryEntities.filter(entity => entity.type === 'branch');
    const deployments = repositoryEntities.filter(entity => entity.type === 'deployment');
    const releases = repositoryEntities.filter(entity => entity.type === 'release');

    pullRequests.forEach(pullRequest => {
      const matchingIssue = issues.find(issue => issue.number != null && issue.number === pullRequest.number);
      if (matchingIssue) {
        const explicit = [...(matchingIssue.evidence ?? []), ...(pullRequest.evidence ?? [])].some(item => /explicit|closing|linked/i.test(item));
        addRelationship(relationships, matchingIssue.id, pullRequest.id, 'implemented_by', explicit ? 'exact' : 'inferred', explicit ? 'Explicit issue/PR link or closing reference' : 'Matching repository and issue number');
      }
      const matchingBranch = branches.find(branch => branch.branchName && branch.branchName === pullRequest.branchName);
      if (matchingBranch) addRelationship(relationships, matchingBranch.id, pullRequest.id, 'implemented_by', 'strong', 'Matching repository and head branch ref');

      const mergeTime = pullRequest.mergedAt ? new Date(pullRequest.mergedAt).getTime() : NaN;
      if (Number.isFinite(mergeTime)) {
        const deployment = deployments.filter(entity => entity.deployedAt && new Date(entity.deployedAt).getTime() >= mergeTime).sort((a, b) => new Date(a.deployedAt!).getTime() - new Date(b.deployedAt!).getTime())[0];
        if (deployment && new Date(deployment.deployedAt!).getTime() - mergeTime <= 7 * 86400000) addRelationship(relationships, pullRequest.id, deployment.id, 'deployed_as', 'inferred', 'Nearest subsequent deployment in the same repository');
        const release = releases.filter(entity => entity.releasedAt && new Date(entity.releasedAt).getTime() >= mergeTime).sort((a, b) => new Date(a.releasedAt!).getTime() - new Date(b.releasedAt!).getTime())[0];
        if (release && new Date(release.releasedAt!).getTime() - mergeTime <= 14 * 86400000) addRelationship(relationships, pullRequest.id, release.id, 'released_as', 'inferred', 'Nearest subsequent release in the same repository');
      }
    });
  });
  return Array.from(relationships.values());
}

export function relationshipsForEntity(relationships: DeliveryRelationship[], entityId: string): DeliveryRelationship[] {
  return relationships.filter(relationship => relationship.sourceId === entityId || relationship.targetId === entityId);
}
