export type FlowItemType =
  | 'issue'
  | 'pull_request'
  | 'release';

export type FlowStage =
  | 'issues'
  | 'coding'
  | 'pull_requests'
  | 'review'
  | 'checks'
  | 'ready'
  | 'merged'
  | 'released'
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
  isPrerelease?: boolean;
  inclusionReason?: string;
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
