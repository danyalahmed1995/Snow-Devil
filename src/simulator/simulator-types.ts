export type SimulatorSubjectType =
  | "issue"
  | "pull_request"
  | "branch"
  | "commit"
  | "workflow_run"
  | "check_suite"
  | "release"
  | "deployment";

export type SimulatorEventType =
  | "created"
  | "opened"
  | "closed"
  | "reopened"
  | "converted_to_draft"
  | "ready_for_review"
  | "assigned"
  | "unassigned"
  | "labeled"
  | "unlabeled"
  | "milestoned"
  | "demilestoned"
  | "committed"
  | "force_pushed"
  | "commented"
  | "review_comment_added"
  | "review_requested"
  | "review_request_removed"
  | "review_submitted"
  | "approved"
  | "changes_requested"
  | "review_dismissed"
  | "check_queued"
  | "check_started"
  | "check_succeeded"
  | "check_failed"
  | "check_cancelled"
  | "workflow_queued"
  | "workflow_started"
  | "workflow_succeeded"
  | "workflow_failed"
  | "workflow_cancelled"
  | "merged"
  | "release_drafted"
  | "prereleased"
  | "released"
  | "deployment_created"
  | "deployment_in_progress"
  | "deployment_succeeded"
  | "deployment_failed";

export type AccountInclusionReason =
  | "authored_by_you"
  | "assigned_to_you"
  | "review_requested_from_you"
  | "reviewed_by_you"
  | "commented_on_by_you"
  | "merged_contribution"
  | "release_published_by_you"
  | "deployment_triggered_by_you";

export interface SimulatorEvent {
  id: string;
  source: string;
  occurredAt: string;

  repositoryId: string;
  repositoryName: string;
  repositoryOwner: string;

  subjectId: string;
  subjectNodeId?: string;
  subjectType: SimulatorSubjectType;
  subjectNumber?: number;
  subjectTitle: string;

  actor?: {
    login: string;
    avatarUrl?: string;
  };

  eventType: SimulatorEventType;

  metadata: Record<string, unknown>;

  inclusionReason?: AccountInclusionReason;

  sourceCompleteness:
    | "complete"
    | "partial"
    | "unknown";
}

export type SimulatorStage =
  | "issues"
  | "coding"
  | "pull_requests"
  | "review"
  | "checks"
  | "ready"
  | "merged"
  | "released"
  | "deployed"
  | "closed";

export interface ActorSummary {
  login: string;
  avatarUrl?: string;
}

export interface LabelSummary {
  name: string;
  color: string;
}

export interface ReleaseSummary {
  tagName: string;
  publishedAt: string;
}

export interface DeploymentSummary {
  environment: string;
  state: string;
}

export interface SimulatorEntityState {
  id: string;
  repositoryId: string;
  subjectType: SimulatorSubjectType;
  title: string;
  number?: number;
  url?: string;

  stage: SimulatorStage;
  status: string;

  author?: ActorSummary;
  assignees: ActorSummary[];
  reviewers: ActorSummary[];
  labels: LabelSummary[];

  commitCount: number;
  commentCount: number;
  reviewCommentCount: number;

  reviewState:
    | "none"
    | "requested"
    | "approved"
    | "changes_requested";

  checkState:
    | "unknown"
    | "queued"
    | "running"
    | "success"
    | "failure"
    | "cancelled";

  release?: ReleaseSummary;
  deployment?: DeploymentSummary;

  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  releasedAt?: string;
  deployedAt?: string;

  lastEventId?: string;
  inclusionReason?: AccountInclusionReason;
  sourceCompleteness?: SimulatorEvent["sourceCompleteness"];
  baselineAtReplayStart?: boolean;
  baselineLabel?: string;
}

export type SimulatorLoadState =
  | "idle"
  | "loading_initial"
  | "ready_complete"
  | "ready_partial"
  | "refreshing"
  | "error";

export type SimulatorFailureCategory =
  | "authentication"
  | "rate_limit"
  | "network"
  | "partial_source"
  | "invalid_response"
  | "cache_incompatible"
  | "normalization_failed"
  | "replay_construction_failed"
  | "unknown";

export interface SimulatorSourceFailure {
  sourceId: string;
  label: string;
  category: SimulatorFailureCategory;
  message: string;
  retryable: boolean;
  occurredAt: string;
}

export interface SimulatorSourceStatus {
  sourceId: string;
  label: string;
  purpose: string;
  affectedData: string;
  status: 'loaded' | 'partial' | 'failed' | 'skipped' | 'unsupported';
  category?: SimulatorFailureCategory;
  message?: string;
  retryable: boolean;
  lastAttemptAt?: string;
}

export type HistoricalDepth = 'full_available' | 'retention_bounded' | 'api_bounded' | 'current_only' | 'partial_events';

export interface SimulatorLoadDetails {
  sourceFailures: SimulatorSourceFailure[];
  sourceStatuses?: SimulatorSourceStatus[];
  loadedSources: number;
  totalSources: number;
  cached: boolean;
  stale: boolean;
  cacheRange?: {
    since: string;
    until: string;
    eventCount: number;
  };
  refreshError?: SimulatorSourceFailure;
  cacheError?: SimulatorSourceFailure;
  historicalDepth?: HistoricalDepth;
  historicalDepthMessage?: string;
}
