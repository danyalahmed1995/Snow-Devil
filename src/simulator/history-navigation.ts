import { classifyActor } from '../lib/delivery-semantics';
import type { HistoryFiltersState } from '../stores/history-view-store';
import type { SimulatorEntityState, SimulatorEvent } from './simulator-types';

export type HistorySection = 'active' | 'ci' | 'completed';
const COMPLETED = new Set(['closed', 'merged', 'released', 'deployed']);

export interface HistoryNavigationTarget {
  event: SimulatorEvent;
  entity?: SimulatorEntityState;
  section?: HistorySection;
}

export function resolveHistoryNavigationTarget(eventId: string, events: SimulatorEvent[], entities: SimulatorEntityState[]): HistoryNavigationTarget | undefined {
  const event = events.find(value => value.id === eventId);
  if (!event) return undefined;
  const entity = entities.find(value => value.id === event.subjectId);
  return { event, entity, section: entity ? entity.subjectType === 'workflow_run' ? 'ci' : COMPLETED.has(entity.stage) ? 'completed' : 'active' : undefined };
}

export function historyFilterConflicts(entity: SimulatorEntityState, filters: HistoryFiltersState, mode: 'account' | 'repository'): Array<keyof HistoryFiltersState> {
  const conflicts: Array<keyof HistoryFiltersState> = [];
  if (mode === 'account' && filters.repository !== 'all' && entity.repositoryId !== filters.repository) conflicts.push('repository');
  if (filters.entityType !== 'all' && entity.subjectType !== filters.entityType) conflicts.push('entityType');
  if (filters.confidence !== 'all' && entity.sourceCompleteness !== filters.confidence) conflicts.push('confidence');
  const bot = ['dependabot', 'renovate', 'other_bot'].includes(classifyActor(entity.author?.login));
  if (!filters.includeBots && bot || filters.actor === 'humans' && bot || filters.actor === 'bots' && !bot) conflicts.push('actor');
  if (mode === 'account' && filters.involvement !== 'all' && !entity.inclusionReason?.includes(filters.involvement)) conflicts.push('involvement');
  return [...new Set(conflicts)];
}

export function eventMatchesHistoryFilters(event: SimulatorEvent, filters: HistoryFiltersState, mode: 'account' | 'repository'): boolean {
  if (mode === 'account' && filters.repository !== 'all' && event.repositoryId.toLowerCase() !== filters.repository.toLowerCase()) return false;
  if (filters.entityType !== 'all' && event.subjectType !== filters.entityType) return false;
  if (filters.confidence !== 'all' && event.sourceCompleteness !== filters.confidence) return false;
  const bot = ['dependabot', 'renovate', 'other_bot'].includes(classifyActor(event.actor?.login));
  if (!filters.includeBots && bot || filters.actor === 'humans' && bot || filters.actor === 'bots' && !bot) return false;
  if (mode === 'account' && filters.involvement !== 'all' && !event.inclusionReason?.includes(filters.involvement)) return false;
  return true;
}

export function entityMatchesHistorySearch(entity: SimulatorEntityState, query: string): boolean {
  return `${entity.title} ${entity.repositoryId} ${entity.number ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
}
