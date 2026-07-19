import type { ActivityClassification, AttentionReason } from '../lib/delivery-semantics';
import type { ViewerRelationship } from '../lib/product-model';

export interface ResponsibilityCandidate {
  entity: {
    id: string;
    author?: string;
    updatedAt: string;
    reviewState?: string;
    checkState?: string;
  };
  activity: ActivityClassification;
  relationship: ViewerRelationship;
  attention: { needsAttention: boolean; reasons: AttentionReason[] };
}

export function partitionCanonicalResponsibilities<T extends ResponsibilityCandidate>(items: T[], viewerLogin: string, includeDormant: boolean) {
  const unique = new Map<string, T>();
  for (const item of items) {
    const current = unique.get(item.entity.id);
    if (!current || item.entity.updatedAt > current.entity.updatedAt) unique.set(item.entity.id, item);
  }
  const direct = [...unique.values()].filter(item => item.relationship.directResponsibility);
  const waiting = direct.filter(item => item.activity !== 'dormant'
    && item.entity.author?.toLowerCase() === viewerLogin.toLowerCase()
    && (item.entity.reviewState === 'requested' || ['queued', 'running'].includes(item.entity.checkState ?? '')));
  const waitingIds = new Set(waiting.map(item => item.entity.id));
  const doNow = direct.filter(item => item.activity !== 'dormant'
    && !waitingIds.has(item.entity.id)
    && (item.attention.needsAttention || item.activity === 'active'));
  const doNowIds = new Set(doNow.map(item => item.entity.id));
  const gettingStale = direct.filter(item => item.activity !== 'dormant'
    && !doNowIds.has(item.entity.id)
    && !waitingIds.has(item.entity.id)
    && ['aging', 'stale'].includes(item.activity));
  const dormant = includeDormant ? direct.filter(item => item.activity === 'dormant') : [];
  const canonical = [...doNow, ...waiting, ...gettingStale, ...dormant];
  return { doNow, waiting, gettingStale, dormant, canonical };
}

export function distinctReason(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  return parts.flatMap(part => (part ?? '').split(/[.·]/).map(value => value.trim()).filter(Boolean)).filter(part => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(' · ');
}
