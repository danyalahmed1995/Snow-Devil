import { matchesStructuredSearch } from '../lib/structured-search';
import { isMaintainedRepository } from '../lib/product-model';
import { canonicalRepositoryIdentity } from '../lib/canonical-identity';
import type { AnalyticsSettings, DeliveryRiskViewState, InventoryItem } from './types';

export type DeliveryRiskHiddenReason =
  | 'legacy'
  | 'bot_policy'
  | 'delivery_informational'
  | 'saved_view_rule'
  | 'archive_policy'
  | 'fork_policy'
  | 'mute_policy'
  | 'age_policy'
  | 'entity_type'
  | 'repository_scope'
  | 'confidence'
  | 'ownership'
  | 'search'
  | 'risk_category';

export const DELIVERY_RISK_HIDDEN_REASON_LABELS: Record<DeliveryRiskHiddenReason, string> = {
  legacy: 'Legacy backlog', bot_policy: 'Bot policy', delivery_informational: 'Delivery informational', saved_view_rule: 'Saved-view backlog rule', archive_policy: 'Archive policy', fork_policy: 'Fork policy', mute_policy: 'Mute policy', age_policy: 'Age policy', entity_type: 'Entity type', repository_scope: 'Repository scope', confidence: 'Confidence', ownership: 'Ownership', search: 'Search', risk_category: 'Risk category',
};

function ownershipMatches(item: InventoryItem, value: string): boolean {
  const flags = item.entity.viewerRelationship?.flags ?? [];
  if (value === 'everyone') return true;
  if (value === 'actionable') return item.actionableRank === 0;
  if (value === 'assigned') return flags.includes('assigned_to_viewer');
  if (value === 'authored') return flags.includes('authored_by_viewer');
  if (value === 'review_requested') return flags.includes('review_requested_from_viewer');
  return flags.includes('viewer_maintains_base_repository') || isMaintainedRepository(item.repository);
}

function ageMatches(days: number | undefined, value: string): boolean {
  if (value === 'all') return true;
  if (days == null) return false;
  if (value === 'active_180') return days <= 180;
  if (value === '0_7') return days <= 7;
  if (value === '8_30') return days > 7 && days <= 30;
  if (value === '31_90') return days > 30 && days <= 90;
  if (value === '91_180') return days > 90 && days <= 180;
  return value === 'over_180' ? days > 180 : true;
}

/**
 * Mutually-exclusive view exclusion precedence. The first matching rule owns the
 * item so diagnostics can always reconcile classified = visible + hidden.
 */
export function deliveryRiskHiddenReason(item: InventoryItem, view: DeliveryRiskViewState, settings: AnalyticsSettings, isMuted: (item: InventoryItem) => boolean, options: { ignoreCategory?: boolean } = {}): DeliveryRiskHiddenReason | undefined {
  if (view.backlog !== 'all' && item.backlog !== view.backlog) {
    if (item.backlog === 'legacy') return 'legacy';
    if (item.backlog === 'bot') return 'bot_policy';
    if (item.backlog === 'informational') return 'delivery_informational';
    return 'saved_view_rule';
  }
  if (view.archived === 'hide' && item.repository.archived) return 'archive_policy';
  if (view.forks === 'exclude' && item.repository.fork) return 'fork_policy';
  const muted = isMuted(item);
  if (view.muted === 'hide' && muted || view.muted === 'only' && !muted) return 'mute_policy';
  if (view.actor === 'human' && item.isBotCreated || view.actor === 'bot' && !item.isBotCreated) return 'bot_policy';
  if (!ageMatches(item.ageBusinessDays, view.age)) return 'age_policy';
  if (view.entityType === 'issues_prs' && !['issue', 'pull_request'].includes(item.entityType) || view.entityType !== 'all' && view.entityType !== 'issues_prs' && item.entityType !== view.entityType) return 'entity_type';
  if (view.scope === 'maintained' && !isMaintainedRepository(item.repository) || view.scope === 'selected' && !settings.includedRepositories.map(canonicalRepositoryIdentity).includes(canonicalRepositoryIdentity(item.repository.id)) || view.repositoryId !== 'all' && canonicalRepositoryIdentity(item.repository.id) !== canonicalRepositoryIdentity(view.repositoryId)) return 'repository_scope';
  if (view.confidence === 'exact' && item.confidence !== 'exact' || view.confidence === 'partial' && item.confidence === 'exact' || view.confidence === 'unknown' && item.confidence !== 'unavailable') return 'confidence';
  if (!ownershipMatches(item, view.ownership)) return 'ownership';
  if (!matchesStructuredSearch({ title: item.entity.title, repository: item.repository.nameWithOwner, number: item.entity.number, author: item.entity.author, assignees: item.entity.assignees, reviewers: item.entity.requestedReviewers, type: item.entityType, reason: item.riskLabel, branch: item.entity.branchName, evidence: item.entity.evidence, ageDays: item.ageBusinessDays }, view.search)) return 'search';
  if (!options.ignoreCategory && view.category !== 'all' && item.riskCategory !== view.category) return 'risk_category';
  return undefined;
}

export function deliveryRiskHiddenBreakdown(items: InventoryItem[], view: DeliveryRiskViewState, settings: AnalyticsSettings, isMuted: (item: InventoryItem) => boolean, options: { ignoreCategory?: boolean } = {}): Partial<Record<DeliveryRiskHiddenReason, number>> {
  return items.reduce<Partial<Record<DeliveryRiskHiddenReason, number>>>((result, item) => {
    const reason = deliveryRiskHiddenReason(item, view, settings, isMuted, options);
    if (reason) result[reason] = (result[reason] ?? 0) + 1;
    return result;
  }, {});
}
