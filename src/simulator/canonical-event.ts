import { canonicalSimulatorSubjectIdentity, type CanonicalEntityType } from '../lib/canonical-identity';
import type { SimulatorEvent } from './simulator-types';

const CANONICAL_TYPES = new Set<CanonicalEntityType>([
  'pull_request', 'issue', 'workflow_run', 'release', 'commit', 'deployment', 'check_suite', 'branch',
]);

/** Qualifies replay identity by entity type + base repository and makes event storage keys collision-proof. */
export function canonicalizeSimulatorEvent(event: SimulatorEvent): SimulatorEvent | null {
  if (!event.repositoryId?.includes('/') || !CANONICAL_TYPES.has(event.subjectType as CanonicalEntityType)) return null;
  try {
    const subjectId = canonicalSimulatorSubjectIdentity({
      repositoryId: event.repositoryId,
      subjectType: event.subjectType as CanonicalEntityType,
      subjectNumber: event.subjectNumber,
      subjectId: event.subjectId,
      metadata: event.metadata,
    });
    const id = event.id.startsWith(`${subjectId}:`) ? event.id : `${subjectId}:event:${encodeURIComponent(event.id)}`;
    return { ...event, id, subjectId };
  } catch {
    return null;
  }
}

export function canonicalizeSimulatorEvents(events: SimulatorEvent[]): SimulatorEvent[] {
  const canonical = events.map(canonicalizeSimulatorEvent).filter((event): event is SimulatorEvent => Boolean(event));
  const unique = new Map<string, SimulatorEvent>();
  for (const event of canonical) {
    const previous = unique.get(event.id);
    if (!previous || previous.sourceCompleteness !== 'complete' && event.sourceCompleteness === 'complete') unique.set(event.id, event);
  }
  return [...unique.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

