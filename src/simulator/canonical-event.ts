import { canonicalSimulatorSubjectIdentity, type CanonicalEntityType } from '../lib/canonical-identity';
import type { SimulatorEvent } from './simulator-types';

const CANONICAL_TYPES = new Set<CanonicalEntityType>([
  'pull_request', 'issue', 'workflow_run', 'release', 'commit', 'deployment', 'check_suite', 'branch',
]);

function metadataTimestamp(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

/** Repairs legacy sync-time events and makes source, observation, and persistence time explicit. */
export function normalizeSimulatorEventProvenance(event: SimulatorEvent, persistedAt?: string): SimulatorEvent {
  const metadata = event.metadata ?? {};
  const observationOnly = event.observationOnly === true || metadata.currentSnapshot === true || metadata.nativeOrDerived === 'current_snapshot';
  const observedAt = event.observedAt ?? metadataTimestamp(metadata, 'observedAt') ?? (observationOnly ? event.occurredAt : undefined);
  const sourceOccurredAt = event.sourceOccurredAt ?? metadataTimestamp(metadata, 'sourceOccurredAt') ?? (observationOnly ? metadataTimestamp(metadata, 'actualUpdatedAt') : undefined) ?? event.occurredAt;
  const normalizedPersistedAt = event.persistedAt ?? metadataTimestamp(metadata, 'persistedAt') ?? persistedAt;
  return {
    ...event,
    occurredAt: sourceOccurredAt,
    sourceOccurredAt,
    observedAt,
    persistedAt: normalizedPersistedAt,
    observationOnly,
    actor: observationOnly ? undefined : event.actor,
    metadata: { ...metadata, sourceOccurredAt, ...(observedAt ? { observedAt } : {}), ...(normalizedPersistedAt ? { persistedAt: normalizedPersistedAt } : {}), observationOnly },
  };
}

/** Qualifies replay identity by entity type + base repository and makes event storage keys collision-proof. */
export function canonicalizeSimulatorEvent(event: SimulatorEvent): SimulatorEvent | null {
  const normalized = normalizeSimulatorEventProvenance(event);
  if (!normalized.repositoryId?.includes('/') || !CANONICAL_TYPES.has(normalized.subjectType as CanonicalEntityType)) return null;
  try {
    const subjectId = canonicalSimulatorSubjectIdentity({
      repositoryId: normalized.repositoryId,
      subjectType: normalized.subjectType as CanonicalEntityType,
      subjectNumber: normalized.subjectNumber,
      subjectId: normalized.subjectId,
      metadata: normalized.metadata,
    });
    const id = normalized.id.startsWith(`${subjectId}:`) ? normalized.id : `${subjectId}:event:${encodeURIComponent(normalized.id)}`;
    return { ...normalized, id, subjectId };
  } catch {
    return null;
  }
}

export function canonicalizeSimulatorEvents(events: SimulatorEvent[]): SimulatorEvent[] {
  const canonical = events.map(canonicalizeSimulatorEvent).filter((event): event is SimulatorEvent => Boolean(event));
  const unique = new Map<string, SimulatorEvent>();
  for (const event of canonical) {
    const previous = unique.get(event.id);
    if (!previous) { unique.set(event.id, event); continue; }
    if (event.observationOnly) {
      const latest = (event.observedAt ?? '').localeCompare(previous.observedAt ?? '') >= 0 ? event : previous;
      unique.set(event.id, { ...previous, ...latest, metadata: { ...previous.metadata, ...latest.metadata }, actor: undefined });
      continue;
    }
    const richer = previous.sourceCompleteness !== 'complete' && event.sourceCompleteness === 'complete' ? event : previous;
    const metadata = { ...previous.metadata, ...event.metadata };
    unique.set(event.id, { ...previous, ...richer, occurredAt: previous.sourceOccurredAt ?? previous.occurredAt, sourceOccurredAt: previous.sourceOccurredAt ?? previous.occurredAt, observedAt: [previous.observedAt, event.observedAt].filter((value): value is string => Boolean(value)).sort().pop(), persistedAt: [previous.persistedAt, event.persistedAt].filter((value): value is string => Boolean(value)).sort().pop(), actor: previous.actor ?? event.actor, metadata });
  }
  return [...unique.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}
