import type { SimulatorEventType, SimulatorStage, SimulatorSubjectType } from '../simulator/simulator-types';

export type LineageConfidence = 'exact' | 'strong' | 'inferred' | 'unknown';

export type DeliveryEntityType = SimulatorSubjectType | 'review' | 'check_run';

export interface DeliveryEntity {
  id: string;
  repositoryId: string;
  type: DeliveryEntityType;
  number?: number;
  title: string;
  url?: string;
  stage: SimulatorStage;
  state: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  firstCommitAt?: string;
  prOpenedAt?: string;
  firstReviewAt?: string;
  mergedAt?: string;
  deployedAt?: string;
  releasedAt?: string;
  closedAt?: string;
  branchName?: string;
  baseBranch?: string;
  isDraft?: boolean;
  isBot?: boolean;
  reviewState?: 'none' | 'requested' | 'approved' | 'changes_requested';
  checkState?: 'unknown' | 'queued' | 'running' | 'success' | 'failure' | 'cancelled';
  requestedReviewers?: string[];
  assignees?: string[];
  sourceCompleteness: 'complete' | 'partial' | 'unknown';
  evidence?: string[];
}

export interface DeliveryEvent {
  id: string;
  entityId: string;
  repositoryId: string;
  type: SimulatorEventType;
  occurredAt: string;
  stage?: SimulatorStage;
  actor?: string;
  directPush?: boolean;
  sourceCompleteness: 'complete' | 'partial' | 'unknown';
}

export interface DeliveryRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  kind: 'closes' | 'implemented_by' | 'contains' | 'checked_by' | 'merged_as' | 'deployed_as' | 'released_as';
  confidence: LineageConfidence;
  evidence: string;
}

export interface DeliveryBranch {
  id: string;
  repositoryId: string;
  name: string;
  firstObservedAt: string;
  lastActivityAt: string;
  mergedAt?: string;
  deletedAt?: string;
  defaultBranch: boolean;
  estimated: boolean;
}

export interface AnalyticsRepository {
  id: string;
  nameWithOwner: string;
  url?: string;
  defaultBranch: string;
  archived?: boolean;
  fork?: boolean;
  private?: boolean;
  releaseMatching: boolean;
  deploymentMatching: boolean;
  capabilityNote?: string;
}

export interface AnalyticsDataset {
  referenceDate: string;
  refreshedAt: string;
  repositories: AnalyticsRepository[];
  entities: DeliveryEntity[];
  events: DeliveryEvent[];
  branches: DeliveryBranch[];
  relationships: DeliveryRelationship[];
  partial: boolean;
  partialReasons: string[];
}

export interface InventoryThresholds {
  agingDays: number;
  staleDays: number;
}

export interface RepositoryAnalyticsOverride {
  included?: boolean;
  branchThresholdHours?: number;
  inventoryThresholds?: InventoryThresholds;
  releaseMatching?: boolean;
  deploymentMatching?: boolean;
  defaultBranch?: string;
  includeBots?: boolean;
  capabilityNote?: string;
}

export interface AnalyticsSettings {
  includedRepositories: string[];
  ignoredRepositories: string[];
  includeArchived: boolean;
  includeForks: boolean;
  includePrivate: boolean;
  includeBots: boolean;
  includeDependabot: boolean;
  includeRenovate: boolean;
  includeDraftPullRequests: boolean;
  defaultRangeDays: 30 | 60 | 90;
  businessTimezone: string;
  businessDays: number[];
  branchThresholdHours: number;
  inventoryThresholds: InventoryThresholds;
  staleDefaultBranchDays: number;
  cacheRetentionDays: number;
  refreshIntervalMinutes: number;
  releaseDeploymentStrategy: 'explicit' | 'tag_or_sha' | 'disabled';
  minimumPercentileSamples: number;
  repositoryOverrides: Record<string, RepositoryAnalyticsOverride>;
}

export type CiStatus = 'excellent' | 'good' | 'warning' | 'poor';
export type AgeBand = 'in_flight' | 'aging' | 'stale';

export interface RepositoryHealth {
  repository: AnalyticsRepository;
  status: CiStatus;
  reasons: string[];
  openBranches: number;
  branchesOverThreshold: number;
  oldestActiveHours: number | null;
  lastDefaultBranchActivity?: string;
  integrations: number;
  integrationsPerWeek: number;
  directPushes: number;
  p50BranchHours: number | null;
  p90BranchHours: number | null;
  estimated: boolean;
}

export type InventoryType =
  | 'merged_not_released'
  | 'merged_not_deployed'
  | 'deployed_not_released'
  | 'released_not_deployed'
  | 'waiting_for_review'
  | 'changes_requested'
  | 'checks_waiting'
  | 'checks_failing'
  | 'ready_not_merged'
  | 'stale_branch'
  | 'stale_draft'
  | 'closed_unmerged';

export interface InventoryItem {
  id: string;
  entity: DeliveryEntity;
  repository: AnalyticsRepository;
  type: InventoryType;
  stage: string;
  ageBusinessDays: number;
  ageBand: AgeBand;
  lastActivityAt: string;
  blockingReason: string;
  relatedEntityIds: string[];
  confidence: LineageConfidence;
}

export interface LeadTimeSample {
  entityId: string;
  repositoryId: string;
  metric: LeadTimeMetric;
  hours: number;
  estimated: boolean;
}

export type LeadTimeMetric =
  | 'issue_to_pr'
  | 'pr_to_review'
  | 'pr_to_merge'
  | 'commit_to_merge'
  | 'merge_to_deploy'
  | 'deploy_to_release'
  | 'issue_to_release'
  | 'issue_to_deploy';

export interface AnalyticsInspectable {
  id: string;
  kind: DeliveryEntityType | 'repository' | 'ci_health' | 'inventory';
  title: string;
  repositoryId?: string;
  number?: number;
  url?: string;
  state?: string;
  occurredAt?: string;
  reason?: string;
  confidence?: LineageConfidence;
  evidence?: string[];
  relatedEntityIds?: string[];
  timeline?: Array<{ label: string; occurredAt: string; confidence: LineageConfidence }>;
}
