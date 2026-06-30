export type CanonicalEntityType =
  | 'pull_request'
  | 'issue'
  | 'workflow_run'
  | 'release'
  | 'commit'
  | 'deployment'
  | 'check_suite'
  | 'branch';

const ENTITY_PREFIX: Record<CanonicalEntityType, string> = {
  pull_request: 'pull-request',
  issue: 'issue',
  workflow_run: 'workflow-run',
  release: 'release',
  commit: 'commit',
  deployment: 'deployment',
  check_suite: 'check-suite',
  branch: 'branch',
};

export function canonicalRepositoryIdentity(repository: string): string {
  const parts = repository.trim().split('/');
  if (parts.length !== 2 || parts.some(part => !part || !/^[A-Za-z0-9_.-]+$/.test(part)) || parts[0].length > 39 || parts[1].length > 100) {
    throw new Error('A canonical GitHub repository must use owner/name.');
  }
  return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}

export function canonicalEntityIdentity(
  type: CanonicalEntityType,
  repository: string,
  identifier: string | number,
): string {
  const value = String(identifier).trim();
  if (!value || value.length > 512) throw new Error('A canonical entity identifier is required.');
  return `${ENTITY_PREFIX[type]}:${canonicalRepositoryIdentity(repository)}:${encodeURIComponent(value)}`;
}

export function canonicalIssueIdentity(repository: string, number: number): string {
  return canonicalEntityIdentity('issue', repository, number);
}

export function canonicalPullRequestIdentity(repository: string, number: number): string {
  return canonicalEntityIdentity('pull_request', repository, number);
}

export function canonicalWorkflowRunIdentity(repository: string, runId: string | number): string {
  return canonicalEntityIdentity('workflow_run', repository, runId);
}

export function canonicalSimulatorSubjectIdentity(input: {
  repositoryId: string;
  subjectType: CanonicalEntityType;
  subjectNumber?: number;
  subjectId: string;
  metadata?: Record<string, unknown>;
}): string {
  if ((input.subjectType === 'pull_request' || input.subjectType === 'issue') && input.subjectNumber != null) {
    return canonicalEntityIdentity(input.subjectType, input.repositoryId, input.subjectNumber);
  }
  const metadataId = input.subjectType === 'workflow_run' ? input.metadata?.runId
    : input.subjectType === 'release' ? input.metadata?.tagName ?? input.metadata?.tag
    : input.subjectType === 'commit' ? input.metadata?.sha
    : undefined;
  const fallback = typeof metadataId === 'string' || typeof metadataId === 'number' ? metadataId : input.subjectId;
  return canonicalEntityIdentity(input.subjectType, input.repositoryId, fallback);
}

export function isCanonicalEntityIdentity(value: string): boolean {
  return /^(?:pull-request|issue|workflow-run|release|commit|deployment|check-suite|branch):[^/:]+\/[^/:]+:.+$/.test(value);
}
