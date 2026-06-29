import { classifyActor, type ActorClassification, type EvidenceConfidence } from './delivery-semantics';

export type ViewerRelationshipFlag =
  | 'authored_by_viewer'
  | 'assigned_to_viewer'
  | 'review_requested_from_viewer'
  | 'mentioned_viewer'
  | 'viewer_participated'
  | 'viewer_subscribed'
  | 'viewer_owns_base_repository'
  | 'viewer_maintains_base_repository'
  | 'viewer_has_push_permission'
  | 'viewer_has_triage_permission'
  | 'viewer_org_member'
  | 'repository_pinned_or_followed'
  | 'incoming_to_maintained_repository'
  | 'submitted_upstream_by_viewer'
  | 'bot_authored'
  | 'human_authored';

export type RepositoryPermission = 'ADMIN' | 'MAINTAIN' | 'WRITE' | 'TRIAGE' | 'READ' | 'NONE' | 'UNKNOWN';

export interface RepositoryRelationshipInput {
  nameWithOwner?: string;
  ownerLogin?: string;
  viewerPermission?: RepositoryPermission | string;
  isFork?: boolean;
}

export interface ViewerRelationshipInput {
  viewerLogin?: string;
  authorLogin?: string;
  authorType?: string;
  authorIsBot?: boolean;
  assignees?: string[];
  requestedReviewers?: string[];
  mentions?: string[];
  participants?: string[];
  subscribed?: boolean;
  pinnedOrFollowed?: boolean;
  viewerOrgMember?: boolean;
  baseRepository?: RepositoryRelationshipInput;
  headRepository?: RepositoryRelationshipInput;
}

export interface ViewerRelationship {
  flags: ViewerRelationshipFlag[];
  primary: ViewerRelationshipFlag | 'unrelated';
  label: string;
  explanation: string;
  directResponsibility: boolean;
  actorClassification: ActorClassification;
  confidence: EvidenceConfidence;
}

const normalized = (value?: string) => value?.trim().toLowerCase() ?? '';

export function normalizeRepositoryPermission(value?: string): RepositoryPermission {
  const permission = (value ?? '').toUpperCase();
  return ['ADMIN', 'MAINTAIN', 'WRITE', 'TRIAGE', 'READ', 'NONE'].includes(permission)
    ? permission as RepositoryPermission
    : 'UNKNOWN';
}

export function isMaintainedRepository(repository?: RepositoryRelationshipInput): boolean {
  const permission = normalizeRepositoryPermission(repository?.viewerPermission);
  return permission === 'ADMIN' || permission === 'MAINTAIN' || permission === 'WRITE';
}

export function repositoryContainsPullRequest(selectedRepository: string, baseRepository?: string): boolean {
  return normalized(selectedRepository) === normalized(baseRepository);
}

function containsViewer(values: string[] | undefined, viewer: string): boolean {
  return Boolean(viewer && values?.some(value => normalized(value) === viewer));
}

export function deriveViewerRelationship(input: ViewerRelationshipInput): ViewerRelationship {
  const viewer = normalized(input.viewerLogin);
  const author = normalized(input.authorLogin);
  const actorClassification = classifyActor(input.authorLogin, input.authorIsBot || normalized(input.authorType) === 'bot' || normalized(input.authorType) === 'app');
  const flags = new Set<ViewerRelationshipFlag>();
  const permission = normalizeRepositoryPermission(input.baseRepository?.viewerPermission);
  const baseOwner = normalized(input.baseRepository?.ownerLogin ?? input.baseRepository?.nameWithOwner?.split('/')[0]);
  const headOwner = normalized(input.headRepository?.ownerLogin ?? input.headRepository?.nameWithOwner?.split('/')[0]);

  if (viewer && author === viewer) flags.add('authored_by_viewer');
  if (containsViewer(input.assignees, viewer)) flags.add('assigned_to_viewer');
  if (containsViewer(input.requestedReviewers, viewer)) flags.add('review_requested_from_viewer');
  if (containsViewer(input.mentions, viewer)) flags.add('mentioned_viewer');
  if (containsViewer(input.participants, viewer)) flags.add('viewer_participated');
  if (input.subscribed) flags.add('viewer_subscribed');
  if (viewer && baseOwner === viewer) flags.add('viewer_owns_base_repository');
  if (isMaintainedRepository(input.baseRepository) || flags.has('viewer_owns_base_repository')) flags.add('viewer_maintains_base_repository');
  if (['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)) flags.add('viewer_has_push_permission');
  if (permission === 'TRIAGE' || flags.has('viewer_has_push_permission')) flags.add('viewer_has_triage_permission');
  if (input.viewerOrgMember) flags.add('viewer_org_member');
  if (input.pinnedOrFollowed) flags.add('repository_pinned_or_followed');
  if (!flags.has('authored_by_viewer') && flags.has('viewer_maintains_base_repository')) flags.add('incoming_to_maintained_repository');
  if (flags.has('authored_by_viewer') && viewer && baseOwner && baseOwner !== viewer && (input.headRepository?.isFork || headOwner === viewer)) flags.add('submitted_upstream_by_viewer');
  if (actorClassification === 'human' || actorClassification === 'unknown') flags.add('human_authored');
  else flags.add('bot_authored');

  const directResponsibility = flags.has('authored_by_viewer')
    || flags.has('assigned_to_viewer')
    || flags.has('review_requested_from_viewer')
    || flags.has('mentioned_viewer')
    || flags.has('incoming_to_maintained_repository')
    || flags.has('repository_pinned_or_followed');

  const primary: ViewerRelationship['primary'] = flags.has('review_requested_from_viewer') ? 'review_requested_from_viewer'
    : flags.has('assigned_to_viewer') ? 'assigned_to_viewer'
    : flags.has('mentioned_viewer') ? 'mentioned_viewer'
    : flags.has('submitted_upstream_by_viewer') ? 'submitted_upstream_by_viewer'
    : flags.has('authored_by_viewer') ? 'authored_by_viewer'
    : flags.has('bot_authored') && flags.has('incoming_to_maintained_repository') ? 'bot_authored'
    : flags.has('incoming_to_maintained_repository') ? 'incoming_to_maintained_repository'
    : flags.has('viewer_participated') ? 'viewer_participated'
    : flags.has('viewer_subscribed') ? 'viewer_subscribed'
    : flags.has('repository_pinned_or_followed') ? 'repository_pinned_or_followed'
    : 'unrelated';

  const descriptions: Record<ViewerRelationship['primary'], [string, string]> = {
    review_requested_from_viewer: ['Review requested', 'GitHub explicitly requests your review.'],
    assigned_to_viewer: ['Assigned to you', 'You are currently assigned to this item.'],
    mentioned_viewer: ['Mentioned', 'You were explicitly mentioned and may owe a response.'],
    submitted_upstream_by_viewer: ['Authored by you · Submitted upstream', 'You authored this work from your fork for a repository maintained by someone else.'],
    authored_by_viewer: ['Authored by you', 'You authored this current work item.'],
    incoming_to_maintained_repository: ['Incoming PR', `This work targets a repository you maintain${input.authorLogin ? ` and was opened by ${input.authorLogin}` : ''}.`],
    bot_authored: ['Automated update', `${input.authorLogin ?? 'A GitHub App or bot'} authored this incoming work.`],
    viewer_participated: ['You participated', 'You previously commented, reviewed, or committed, but no direct responsibility is proven.'],
    viewer_subscribed: ['Subscribed', 'You are subscribed to updates for this item.'],
    repository_pinned_or_followed: ['Followed item', 'You explicitly pinned or followed this item.'],
    viewer_owns_base_repository: ['Your repository', 'The base repository belongs to you.'],
    viewer_maintains_base_repository: ['Maintained by you', 'Your repository permission allows you to maintain this work.'],
    viewer_has_push_permission: ['Push access', 'You have push permission on the base repository.'],
    viewer_has_triage_permission: ['Triage access', 'You can triage the base repository.'],
    viewer_org_member: ['Organization work', 'You are a member of the base repository organization.'],
    human_authored: ['Human-authored', 'The work-item author is classified as a human account.'],
    unrelated: ['No direct relationship', 'No current direct responsibility or explicit follow relationship is available.'],
  };
  const [label, explanation] = descriptions[primary];
  const confidence: EvidenceConfidence = viewer && input.authorLogin ? 'exact' : 'partial';
  return { flags: [...flags], primary, label, explanation, directResponsibility, actorClassification, confidence };
}

export interface CurrentStateRecord {
  repositoryId: string;
  type: string;
  number?: number;
  id: string;
  updatedAt: string;
  sourceCompleteness?: 'complete' | 'partial' | 'unknown';
}

export function mergeAuthoritativeCurrentState<T extends CurrentStateRecord>(history: T[], current: T[]): T[] {
  const key = (item: T) => item.number == null ? item.id : `${normalized(item.repositoryId)}:${normalized(item.type)}:${item.number}`;
  const merged = new Map(history.map(item => [key(item), item]));
  for (const item of current) {
    const previous = merged.get(key(item));
    merged.set(key(item), previous
      ? { ...previous, ...item, sourceCompleteness: item.sourceCompleteness ?? previous.sourceCompleteness }
      : item);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

