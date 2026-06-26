import { invoke } from "@tauri-apps/api/core";
import { SimulatorEvent } from "./simulator-types";

interface DbSimulatorEvent {
  id: string;
  repository_id: string;
  repository_name: string | null;
  repository_owner: string | null;
  subject_id: string;
  subject_type: string | null;
  subject_number: number | null;
  subject_title: string | null;
  event_type: string;
  timestamp: string;
  actor_json: string | null;
  metadata_json: string | null;
  source: string;
  completeness: string;
  inclusion_reason: string | null;
}

interface DbSyncState {
  id: string;
  scope: string;
  cursor: string | null;
  last_synced_at: string;
}

export async function saveSimulatorEventsToDb(events: SimulatorEvent[]): Promise<void> {
  const dbEvents: DbSimulatorEvent[] = events.map(e => ({
    id: e.id,
    repository_id: e.repositoryId,
    repository_name: e.repositoryName,
    repository_owner: e.repositoryOwner,
    subject_id: e.subjectId,
    subject_type: e.subjectType,
    subject_number: e.subjectNumber ?? null,
    subject_title: e.subjectTitle,
    event_type: e.eventType,
    timestamp: e.occurredAt,
    actor_json: e.actor ? JSON.stringify(e.actor) : null,
    metadata_json: JSON.stringify(e.metadata),
    source: e.source,
    completeness: e.sourceCompleteness,
    inclusion_reason: e.inclusionReason ?? null,
  }));
  await invoke("save_simulator_events", { events: dbEvents });
}

export async function getSimulatorEventsFromDb(repositoryId?: string): Promise<SimulatorEvent[]> {
  const dbEvents: DbSimulatorEvent[] = await invoke("get_simulator_events", { repositoryId });
  const normalized = dbEvents.map(e => {
    const [repositoryOwner = "", repositoryName = ""] = e.repository_id.split("/");
    const inferredType = e.subject_id.startsWith("pr-") || e.subject_id.startsWith("pull_request-")
      ? "pull_request"
      : e.subject_id.startsWith("release-") ? "release" : "issue";
    const subjectType = (e.subject_type || inferredType) as SimulatorEvent["subjectType"];
    const inferredNumber = e.subject_id.match(/^(?:pr|pull_request|issue)-(\d+)$/)?.[1];
    const subjectNumber = e.subject_number ?? (inferredNumber ? Number(inferredNumber) : undefined);
    const legacyShortSubject = /^(?:pr|pull_request|issue)-\d+$/.test(e.subject_id);
    const subjectId = legacyShortSubject && subjectNumber != null ? `${subjectType}-${subjectNumber}` : e.subject_id;
    return ({
    id: e.id,
    repositoryId: e.repository_id,
    repositoryName: e.repository_name || repositoryName,
    repositoryOwner: e.repository_owner || repositoryOwner,
    subjectId,
    subjectType,
    subjectNumber,
    subjectTitle: e.subject_title || "",
    occurredAt: e.timestamp,
    eventType: e.event_type as any,
    actor: e.actor_json ? JSON.parse(e.actor_json) : undefined,
    metadata: e.metadata_json ? JSON.parse(e.metadata_json) : {},
    source: e.source,
    sourceCompleteness: e.completeness as any,
    inclusionReason: e.inclusion_reason as SimulatorEvent["inclusionReason"],
  });
  });
  const bestBySubject = new Map<string, SimulatorEvent>();
  for (const event of normalized) {
    const key = `${event.repositoryId}:${event.subjectId}`;
    const previous = bestBySubject.get(key);
    if (!previous || eventQuality(event) > eventQuality(previous)) bestBySubject.set(key, event);
  }
  const enriched = normalized.map(event => {
    const best = bestBySubject.get(`${event.repositoryId}:${event.subjectId}`);
    if (!best) return event;
    return {
      ...event,
      repositoryName: event.repositoryName || best.repositoryName,
      repositoryOwner: event.repositoryOwner || best.repositoryOwner,
      subjectType: event.subjectType || best.subjectType,
      subjectNumber: event.subjectNumber ?? best.subjectNumber,
      subjectTitle: event.subjectTitle?.trim() ? event.subjectTitle : best.subjectTitle,
      actor: event.actor || best.actor,
      inclusionReason: event.inclusionReason || best.inclusionReason,
    };
  });
  const deduplicated = new Map<string, SimulatorEvent>();
  for (const event of enriched) {
    const key = `${event.repositoryId}:${event.subjectId}:${event.eventType}:${event.occurredAt}`;
    const previous = deduplicated.get(key);
    if (!previous || eventQuality(event) > eventQuality(previous)) deduplicated.set(key, event);
  }
  return Array.from(deduplicated.values()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function eventQuality(event: SimulatorEvent): number {
  const completeness = event.sourceCompleteness === "complete" ? 20 : event.sourceCompleteness === "partial" ? 10 : 0;
  return completeness
    + (event.subjectNumber != null ? 4 : 0)
    + (event.subjectTitle?.trim() ? 4 : 0)
    + (event.repositoryName?.trim() ? 1 : 0)
    + (event.actor?.login ? 1 : 0);
}

export async function saveSimulatorSyncState(id: string, scope: string, cursor: string | null): Promise<void> {
  await invoke("save_simulator_sync_state", {
    id,
    scope,
    cursor,
    lastSyncedAt: new Date().toISOString()
  });
}

export async function getSimulatorSyncState(id: string): Promise<DbSyncState | null> {
  return await invoke("get_simulator_sync_state", { id });
}
