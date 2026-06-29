import type { SimulatorEntityState, SimulatorEvent, SimulatorSubjectType } from "./simulator-types";

const SUBJECT_LABELS: Record<SimulatorSubjectType, string> = {
  issue: "Issue",
  pull_request: "Pull request",
  branch: "Branch",
  commit: "Commit",
  workflow_run: "Workflow run",
  check_suite: "Check suite",
  release: "Release",
  deployment: "Deployment",
};

export function humanizeSimulatorValue(value: string | undefined): string {
  if (!value) return "Unknown";
  const words = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatSubjectType(type: SimulatorSubjectType): string {
  return SUBJECT_LABELS[type] ?? humanizeSimulatorValue(type);
}

export function formatEntityReference(entity: SimulatorEntityState): string {
  if (entity.subjectType === "release") return entity.release?.tagName || formatSubjectType(entity.subjectType);
  if (entity.number != null) return `${entity.subjectType === "pull_request" ? "PR " : ""}#${entity.number}`;
  return formatSubjectType(entity.subjectType);
}

export function formatEntityTitle(entity: SimulatorEntityState): string {
  const title = entity.title?.trim();
  return title || `${formatSubjectType(entity.subjectType)} details unavailable`;
}

export function formatEventReference(event: SimulatorEvent): string {
  if (event.subjectNumber != null) return `${event.subjectType === "pull_request" ? "PR " : ""}#${event.subjectNumber}`;
  const title = event.subjectTitle?.trim();
  return title || `${formatSubjectType(event.subjectType)} details unavailable`;
}

export function formatEventTitle(event: SimulatorEvent): string {
  return event.subjectTitle?.trim() || `${formatSubjectType(event.subjectType)} details unavailable`;
}
