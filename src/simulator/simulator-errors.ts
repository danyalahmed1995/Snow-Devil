import type { SimulatorFailureCategory, SimulatorSourceFailure } from "./simulator-types";

export class SimulatorSafeError extends Error {
  category: SimulatorFailureCategory;
  retryable: boolean;

  constructor(category: SimulatorFailureCategory, message: string, retryable = true) {
    super(message);
    this.name = "SimulatorSafeError";
    this.category = category;
    this.retryable = retryable;
  }
}

export function classifySimulatorError(cause: unknown, fallback: SimulatorFailureCategory = "unknown"): SimulatorFailureCategory {
  if (cause instanceof SimulatorSafeError) return cause.category;
  const text = String(cause instanceof Error ? cause.message : cause).toLowerCase();
  if (text.includes("rate limit") || text.includes("rate_limited") || text.includes("secondary rate")) return "rate_limit";
  if (text.includes("401") || text.includes("403") && text.includes("bad credentials") || text.includes("no token") || text.includes("unauthorized") || text.includes("authentication") || text.includes("auth expired")) return "authentication";
  if (text.includes("failed to fetch") || text.includes("network") || text.includes("offline") || text.includes("timeout") || text.includes("dns") || text.includes("connection")) return "network";
  if (text.includes("cache") || text.includes("json") || text.includes("parse") || text.includes("schema")) return "cache_incompatible";
  if (text.includes("normalization")) return "normalization_failed";
  if (text.includes("replay")) return "replay_construction_failed";
  if (text.includes("graphql errors") || text.includes("invalid") || text.includes("malformed") || text.includes("payload")) return "invalid_response";
  return fallback;
}

export function retryableSimulatorCategory(category: SimulatorFailureCategory): boolean {
  return category !== "cache_incompatible" && category !== "normalization_failed" && category !== "replay_construction_failed";
}

export function toSimulatorFailure(
  cause: unknown,
  sourceId: string,
  label: string,
  fallback: SimulatorFailureCategory = "unknown",
): SimulatorSourceFailure {
  const category = classifySimulatorError(cause, fallback);
  const retryable = cause instanceof SimulatorSafeError ? cause.retryable : retryableSimulatorCategory(category);
  return {
    sourceId,
    label,
    category,
    message: safeSimulatorExplanation(category),
    retryable,
    occurredAt: new Date().toISOString(),
  };
}

export function safeSimulatorTitle(category: SimulatorFailureCategory): string {
  switch (category) {
    case "authentication": return "Authentication required";
    case "rate_limit": return "GitHub rate limit reached";
    case "network": return "Offline or unreachable";
    case "partial_source": return "Partial history data";
    case "invalid_response": return "Invalid GitHub response";
    case "cache_incompatible": return "Cached history needs rebuilding";
    case "normalization_failed": return "Simulator normalization failed";
    case "replay_construction_failed": return "Replay history could not be built";
    default: return "Simulator history unavailable";
  }
}

export function safeSimulatorExplanation(category: SimulatorFailureCategory): string {
  switch (category) {
    case "authentication": return "GitHub rejected the account history request. Reconnect your account and retry.";
    case "rate_limit": return "GitHub temporarily limited history requests. Cached history remains usable when available.";
    case "network": return "Snow Devil could not reach GitHub. Cached history remains usable when available.";
    case "partial_source": return "One or more account activity sources failed, but usable history remains available.";
    case "invalid_response": return "GitHub returned a response Snow Devil could not safely use for simulator history.";
    case "cache_incompatible": return "The saved simulator history is incompatible or corrupt. Snow Devil will rebuild it from available sources.";
    case "normalization_failed": return "One source could not be normalized into simulator events. Other sources can still be shown.";
    case "replay_construction_failed": return "The loaded events could not be converted into a replayable simulator timeline.";
    default: return "Snow Devil could not load simulator history safely.";
  }
}

export function sanitizedDiagnostic(cause: unknown): { name: string; category: SimulatorFailureCategory; stack?: string } {
  const category = classifySimulatorError(cause);
  const name = cause instanceof Error ? cause.name : typeof cause;
  const stack = cause instanceof Error && cause.stack
    ? cause.stack
        .split("\n")
        .slice(0, 6)
        .map(line => line.replace(/https:\/\/github\.com\/[^\s)]+/g, "https://github.com/[redacted]"))
        .join("\n")
    : undefined;
  return { name, category, stack };
}
