import { reconstructState } from './simulator-reducer';
import type { SimulatorEntityState, SimulatorEvent } from './simulator-types';
import { historyCalendarCutoffs, normalizeHistoryCutoff } from '../lib/history-date';

export type HistoryConfidence = 'exact' | 'inferred' | 'partial' | 'unknown';

export interface HistoricalProgress {
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  pullRequestsClosedWithoutMerge: number;
  issuesOpened: number;
  issuesWorked: number;
  issuesClosed: number;
  reviewsSubmitted: number;
  repositoriesContributedTo: number;
  contributors: number;
  releases: number;
  deployments: number;
  recordedEvents: number;
}

export interface HistoricalSnapshot {
  selectedDate: string;
  latestDate: string;
  isLatest: boolean;
  events: SimulatorEvent[];
  entities: SimulatorEntityState[];
  active: SimulatorEntityState[];
  completed: SimulatorEntityState[];
  progress: HistoricalProgress;
  confidence: HistoryConfidence;
  currentAssertionsUsed: boolean;
  duplicateEventsSuppressed: number;
}

const COMPLETED_STAGES = new Set(['closed', 'merged', 'released', 'deployed']);
const REVIEW_EVENTS = new Set(['review_submitted', 'approved', 'changes_requested']);

function isCurrentAssertion(event: SimulatorEvent): boolean {
  return event.source === 'github-current-state'
    || event.metadata.nativeOrDerived === 'current_snapshot'
    || event.metadata.currentState === true
    || event.metadata.authoritativeCurrent === true;
}

function isBaselineSeed(event: SimulatorEvent, selectedDate: string): boolean {
  if (event.metadata.baseline === true) return true;
  if (event.eventType !== 'opened') return false;
  const createdAt = typeof event.metadata.actualCreatedAt === 'string' ? event.metadata.actualCreatedAt : undefined;
  return Boolean(createdAt && createdAt <= selectedDate && event.occurredAt <= selectedDate);
}

function semanticMetadata(metadata: Record<string, unknown>): string {
  const keys = [
    'assignee', 'label', 'reviewer', 'requestedReviewer', 'requestedReviewers', 'checkState',
    'sha', 'tag', 'tagName', 'environment', 'draft', 'merged', 'baseRefName', 'headRefName',
  ];
  return JSON.stringify(Object.fromEntries(keys.filter(key => metadata[key] !== undefined).map(key => [key, metadata[key]])));
}

export function historicalEventKey(event: SimulatorEvent): string {
  return [event.repositoryId.toLowerCase(), event.subjectId, event.eventType, event.occurredAt, semanticMetadata(event.metadata)].join('|');
}

export function eventsAtDate(events: SimulatorEvent[], selectedDate: string, latestDate: string): { events: SimulatorEvent[]; suppressed: number; currentAssertionsUsed: boolean } {
  const isLatest = selectedDate >= latestDate;
  const unique = new Map<string, SimulatorEvent>();
  let currentAssertionsUsed = false;
  for (const event of [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))) {
    if (event.occurredAt > selectedDate) continue;
    const current = isCurrentAssertion(event);
    if (current && !isLatest && !isBaselineSeed(event, selectedDate)) continue;
    if (current) currentAssertionsUsed = true;
    const key = historicalEventKey(event);
    const previous = unique.get(key);
    if (!previous || previous.sourceCompleteness !== 'complete' && event.sourceCompleteness === 'complete') unique.set(key, event);
  }
  return { events: [...unique.values()], suppressed: Math.max(0, events.filter(event => event.occurredAt <= selectedDate).length - unique.size), currentAssertionsUsed };
}

function uniqueSubjects(events: SimulatorEvent[], predicate: (event: SimulatorEvent) => boolean): number {
  return new Set(events.filter(predicate).map(event => `${event.repositoryId.toLowerCase()}:${event.subjectType}:${event.subjectNumber ?? event.subjectId}`)).size;
}

export function cumulativeProgress(events: SimulatorEvent[]): HistoricalProgress {
  const mergedPrs = new Set(events.filter(event => event.subjectType === 'pull_request' && event.eventType === 'merged').map(event => `${event.repositoryId}:${event.subjectId}`));
  const closedPrs = new Set(events.filter(event => event.subjectType === 'pull_request' && event.eventType === 'closed').map(event => `${event.repositoryId}:${event.subjectId}`));
  return {
    pullRequestsOpened: uniqueSubjects(events, event => event.subjectType === 'pull_request' && event.eventType === 'opened'),
    pullRequestsMerged: mergedPrs.size,
    pullRequestsClosedWithoutMerge: [...closedPrs].filter(id => !mergedPrs.has(id)).length,
    issuesOpened: uniqueSubjects(events, event => event.subjectType === 'issue' && event.eventType === 'opened'),
    issuesWorked: uniqueSubjects(events, event => event.subjectType === 'issue'),
    issuesClosed: uniqueSubjects(events, event => event.subjectType === 'issue' && event.eventType === 'closed'),
    reviewsSubmitted: events.filter(event => event.subjectType === 'pull_request' && REVIEW_EVENTS.has(event.eventType)).length,
    repositoriesContributedTo: new Set(events.map(event => event.repositoryId.toLowerCase())).size,
    contributors: new Set(events.flatMap(event => event.actor?.login ? [event.actor.login.toLowerCase()] : [])).size,
    releases: uniqueSubjects(events, event => event.subjectType === 'release' && ['prereleased', 'released'].includes(event.eventType)),
    deployments: uniqueSubjects(events, event => event.subjectType === 'deployment' && event.eventType === 'deployment_succeeded'),
    recordedEvents: events.length,
  };
}

export function buildHistoricalSnapshot(events: SimulatorEvent[], selectedDate: string, latestDate: string): HistoricalSnapshot {
  const cutoff = selectedDate > latestDate ? latestDate : selectedDate;
  const selected = eventsAtDate(events, cutoff, latestDate);
  const entities = [...reconstructState(selected.events, cutoff).values()]
    .map(entity => entity.baselineAtReplayStart ? { ...entity, baselineLabel: 'Existing at history start' } : entity)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  const active = entities.filter(entity => !COMPLETED_STAGES.has(entity.stage));
  const completed = entities.filter(entity => COMPLETED_STAGES.has(entity.stage));
  const confidence: HistoryConfidence = selected.events.length === 0 ? 'unknown'
    : selected.events.some(event => event.sourceCompleteness !== 'complete' || cutoff < latestDate && isCurrentAssertion(event)) ? 'partial'
    : 'exact';
  return {
    selectedDate: cutoff,
    latestDate,
    isLatest: cutoff >= latestDate,
    events: selected.events,
    entities,
    active,
    completed,
    progress: cumulativeProgress(selected.events),
    confidence,
    currentAssertionsUsed: selected.currentAssertionsUsed && cutoff >= latestDate,
    duplicateEventsSuppressed: selected.suppressed,
  };
}

export function previousMeaningfulDate(events: SimulatorEvent[], selectedDate: string, since: string, timeZone?: string, latestDate = selectedDate): string {
  const values = timeZone ? historyCalendarCutoffs(events.map(event => event.occurredAt), latestDate, timeZone) : [...new Set(events.map(event => event.occurredAt))].sort();
  return [...values].reverse().find(timestamp => timestamp < selectedDate) ?? (timeZone ? normalizeHistoryCutoff(since, latestDate, timeZone) : since);
}

export function nextMeaningfulDate(events: SimulatorEvent[], selectedDate: string, latestDate: string, timeZone?: string): string {
  const values = timeZone ? historyCalendarCutoffs(events.map(event => event.occurredAt), latestDate, timeZone) : [...new Set(events.map(event => event.occurredAt))].sort();
  return values.find(timestamp => timestamp > selectedDate) ?? latestDate;
}
