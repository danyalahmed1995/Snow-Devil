import type { DeliveryRiskSavedView, DeliveryRiskViewState } from './types';

export const DEFAULT_DELIVERY_RISK_VIEW: DeliveryRiskViewState = {
  category: 'all', scope: 'maintained', ownership: 'everyone', repositoryId: 'all', actor: 'all', entityType: 'issues_prs', age: 'active_180', archived: 'hide', forks: 'exclude', muted: 'hide', confidence: 'all', backlog: 'active', sort: 'priority', search: '',
};

function builtIn(id: string, name: string, update: Partial<DeliveryRiskViewState>): DeliveryRiskSavedView {
  return { ...DEFAULT_DELIVERY_RISK_VIEW, ...update, id: `builtin:${id}`, name, builtIn: true, visibleColumns: ['work_item', 'repository', 'risk', 'owner', 'age', 'activity', 'action'] };
}

export const BUILT_IN_DELIVERY_RISK_VIEWS: DeliveryRiskSavedView[] = [
  builtIn('active', 'Active Risks', {}),
  builtIn('blocked', 'Blocked Now', { category: 'blocked' }),
  builtIn('awaiting-review', 'Awaiting Review', { category: 'awaiting_review' }),
  builtIn('ready', 'Ready to Merge', { category: 'ready_to_merge' }),
  builtIn('human-stale', 'Human Stale Work', { category: 'stale', actor: 'human', entityType: 'all', age: 'all' }),
  builtIn('bot-backlog', 'Bot Backlog', { backlog: 'bot', actor: 'bot', entityType: 'all', age: 'all' }),
  builtIn('legacy', 'Legacy Backlog', { backlog: 'legacy', entityType: 'all', age: 'over_180' }),
  builtIn('delivery-unknown', 'Delivery Status Unknown', { category: 'delivery_status_unknown', backlog: 'informational', age: 'all' }),
  builtIn('muted', 'Muted Items', { backlog: 'all', muted: 'only', entityType: 'all', age: 'all' }),
];

export function deliveryRiskViewById(id: string, custom: DeliveryRiskSavedView[]): DeliveryRiskSavedView | undefined {
  return [...BUILT_IN_DELIVERY_RISK_VIEWS, ...custom].find(view => view.id === id);
}
