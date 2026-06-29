export type FlowItemType =
  | 'issue'
  | 'pull_request'
  | 'release'
  | 'deployment';

export type FlowStage =
  | 'issues'
  | 'coding'
  | 'pull_requests'
  | 'review'
  | 'checks'
  | 'ready'
  | 'merged'
  | 'released'
  | 'deployed'
  | 'closed'
  | 'absent';

export type FlowStatus =
  | 'idle'
  | 'active'
  | 'queued'
  | 'blocked'
  | 'failing'
  | 'passing'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'released'
  | 'deployed'
  | 'closed';

export interface ActorSummary {
  login: string;
  avatarUrl?: string;
  isBot?: boolean;
}

export interface LabelSummary {
  name: string;
  color: string;
}

export interface ChecksSummary {
  state: 'EXPECTED' | 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR' | 'MISSING';
  totalCount: number;
  successCount: number;
  failureCount: number;
}

export interface ReviewSummary {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'PENDING' | 'NONE';
  requestedReviewers: string[];
  reviews: Array<{ author: string; state: string }>;
}

export interface FlowItem {
  id: string;
  githubId?: string;
  type: FlowItemType;
  repositoryId: string;
  repositoryName: string;
  owner: string;
  number?: number;
  title: string;
  stage: FlowStage;
  status: FlowStatus;
  url?: string;
  author?: ActorSummary;
  reviewers?: ActorSummary[];
  labels?: LabelSummary[];
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  closedAt?: string;
  stageEnteredAt?: string;
  isDraft?: boolean;
  isBot?: boolean;
  checksSummary?: ChecksSummary;
  reviewSummary?: ReviewSummary;
  linkedIssueIds?: string[];
  publishedAt?: string;
  tagName?: string;
  deployedAt?: string;
  environment?: string;
  isPrerelease?: boolean;
  inclusionReason?: string;
  stageReason?: string;
  baseBranch?: string;
  headBranch?: string;
  assignees?: ActorSummary[];
  requestedReviewers?: ActorSummary[];
  commentCount?: number;
  commitCount?: number;
  stageHistory?: FlowStageHistoryEntry[];
  completeness?: 'complete' | 'partial' | 'unknown';
  completenessReason?: string;
  sourceMode?: 'live' | 'demo';
  sourceType?: string;
  referenceTime?: string;
  confidence?: import('../lib/delivery-semantics').EvidenceConfidence;
  attentionReasons?: import('../lib/delivery-semantics').AttentionReason[];
  activityClassification?: import('../lib/delivery-semantics').ActivityClassification;
  actorClassification?: import('../lib/delivery-semantics').ActorClassification;
  missingEvidence?: string[];
  viewerRelationship?: import('../lib/product-model').ViewerRelationship;
  baseRepository?: import('../lib/product-model').RepositoryRelationshipInput;
  headRepository?: import('../lib/product-model').RepositoryRelationshipInput;
}

export interface FlowStageHistoryEntry {
  id: string;
  stage: FlowStage;
  label: string;
  occurredAt: string;
  inferred?: boolean;
}

export interface FlowEvent {
  id: string;
  itemId: string;
  repositoryId: string;
  type: string; // e.g. "ReviewRequestedEvent", "MergedEvent", "CheckRunCompleted"
  occurredAt: string;
  fromStage?: FlowStage;
  toStage?: FlowStage;
  status?: FlowStatus;
  actor?: ActorSummary;
}

export interface FlowState {
  items: Record<string, FlowItem>;
}
