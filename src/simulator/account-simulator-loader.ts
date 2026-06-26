import type { SimulatorEvent, SimulatorLoadDetails, SimulatorLoadState, SimulatorSourceFailure } from "./simulator-types";
import { fetchAccountActivityWithCoverage, type AccountActivityResult } from "./simulator-github-api";
import { getSimulatorEventsFromDb, saveSimulatorEventsToDb } from "./simulator-cache";
import { reconstructState } from "./simulator-reducer";
import { SimulatorSafeError, sanitizedDiagnostic, toSimulatorFailure } from "./simulator-errors";

interface AccountSimulatorLoadDeps {
  readCache?: () => Promise<SimulatorEvent[]>;
  saveEvents?: (events: SimulatorEvent[]) => Promise<void>;
  fetchFresh?: (login: string, since: string, until: string) => Promise<AccountActivityResult>;
  reconstruct?: (events: SimulatorEvent[], cursor: string) => unknown;
  logDiagnostic?: (message: string, diagnostic: unknown) => void;
}

export interface AccountSimulatorSnapshot {
  events: SimulatorEvent[];
  loadState: SimulatorLoadState;
  details: SimulatorLoadDetails;
}

const EMPTY_DETAILS: SimulatorLoadDetails = {
  sourceFailures: [],
  loadedSources: 0,
  totalSources: 0,
  cached: false,
  stale: false,
};

export function emptySimulatorLoadDetails(): SimulatorLoadDetails {
  return { ...EMPTY_DETAILS, sourceFailures: [] };
}

export function accountCacheRange(events: SimulatorEvent[]): SimulatorLoadDetails["cacheRange"] {
  if (events.length === 0) return undefined;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return { since: sorted[0].occurredAt, until: sorted[sorted.length - 1].occurredAt, eventCount: sorted.length };
}

export function isAccountSimulatorEvent(event: SimulatorEvent, login: string): boolean {
  const metadataLogin = typeof event.metadata.accountLogin === "string" ? event.metadata.accountLogin : undefined;
  if (metadataLogin) return metadataLogin.toLowerCase() === login.toLowerCase();
  return Boolean(event.inclusionReason);
}

function validateReplayable(events: SimulatorEvent[], until: string, reconstruct: AccountSimulatorLoadDeps["reconstruct"]) {
  try {
    reconstruct?.(events, until);
  } catch {
    throw new SimulatorSafeError("replay_construction_failed", "Simulator replay construction failed.", false);
  }
}

function markSourceFailure(failure: SimulatorSourceFailure): SimulatorSourceFailure {
  return failure.category === "partial_source" ? failure : { ...failure, category: failure.category };
}

export async function loadAccountSimulatorSnapshot(
  login: string,
  since: string,
  until: string,
  deps: AccountSimulatorLoadDeps = {},
): Promise<AccountSimulatorSnapshot> {
  if (!login || login === "unknown") {
    const failure = toSimulatorFailure(new SimulatorSafeError("authentication", "No account identity.", true), "account", "Account identity", "authentication");
    return {
      events: [],
      loadState: "error",
      details: { ...emptySimulatorLoadDetails(), sourceFailures: [failure], refreshError: failure },
    };
  }

  const readCache = deps.readCache ?? (() => getSimulatorEventsFromDb());
  const saveEvents = deps.saveEvents ?? saveSimulatorEventsToDb;
  const fetchFresh = deps.fetchFresh ?? fetchAccountActivityWithCoverage;
  const buildReplay = deps.reconstruct ?? reconstructState;
  const logDiagnostic = deps.logDiagnostic ?? ((message, diagnostic) => {
    if (import.meta.env.DEV) console.debug(message, diagnostic);
  });

  let cachedEvents: SimulatorEvent[] = [];
  let cacheError: SimulatorSourceFailure | undefined;
  try {
    cachedEvents = (await readCache()).filter(event => isAccountSimulatorEvent(event, login));
  } catch (cause) {
    cacheError = toSimulatorFailure(cause, "account-cache", "Cached account history", "cache_incompatible");
    logDiagnostic("[Simulator] Account cache read failed", sanitizedDiagnostic(cause));
  }

  try {
    const fresh = await fetchFresh(login, since, until);
    validateReplayable(fresh.events, until, buildReplay);
    if (fresh.events.length > 0) await saveEvents(fresh.events);
    const partial = fresh.sourceFailures.length > 0 || fresh.loadedSources < fresh.totalSources;
    return {
      events: fresh.events,
      loadState: partial ? "ready_partial" : "ready_complete",
      details: {
        sourceFailures: fresh.sourceFailures.map(markSourceFailure),
        loadedSources: fresh.loadedSources,
        totalSources: fresh.totalSources,
        cached: false,
        stale: false,
        cacheRange: accountCacheRange(fresh.events),
        cacheError,
      },
    };
  } catch (cause) {
    const refreshError = toSimulatorFailure(cause, "account-refresh", "Account history refresh", "unknown");
    logDiagnostic("[Simulator] Account refresh failed", sanitizedDiagnostic(cause));

    if (cachedEvents.length > 0) {
      validateReplayable(cachedEvents, until, buildReplay);
      return {
        events: cachedEvents,
        loadState: "ready_partial",
        details: {
          sourceFailures: [refreshError],
          loadedSources: 0,
          totalSources: 1,
          cached: true,
          stale: true,
          cacheRange: accountCacheRange(cachedEvents),
          refreshError,
          cacheError,
        },
      };
    }

    return {
      events: [],
      loadState: "error",
      details: {
        sourceFailures: [refreshError],
        loadedSources: 0,
        totalSources: 1,
        cached: false,
        stale: false,
        refreshError,
        cacheError,
      },
    };
  }
}
