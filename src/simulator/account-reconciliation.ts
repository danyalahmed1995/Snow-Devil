import type { FlowItem } from '../types/flow';
import type { SimulatorEntityState } from './simulator-types';
import { canonicalEntityIdentity, type CanonicalEntityType } from '../lib/canonical-identity';

export function canonicalAccountItemId(repositoryId: string, type: string, number?: number): string {
  return canonicalEntityIdentity(type as CanonicalEntityType, repositoryId, number ?? 'un-numbered');
}

export function reconcileLatestAccountState(flowItems: FlowItem[], simulatorEntities: SimulatorEntityState[], intentionalExclusions: string[] = []) {
  const excluded = new Set(intentionalExclusions);
  const flow = new Set(flowItems.filter(item => !['closed', 'merged', 'released', 'deployed'].includes(item.stage)).map(item => canonicalAccountItemId(item.repositoryId, item.type, item.number)));
  const simulator = new Set(simulatorEntities.filter(entity => !['closed', 'merged', 'released', 'deployed'].includes(entity.stage)).map(entity => canonicalAccountItemId(entity.repositoryId, entity.subjectType, entity.number)));
  const missingFromSimulator = [...flow].filter(id => !simulator.has(id) && !excluded.has(id)).sort();
  const simulatorOnly = [...simulator].filter(id => !flow.has(id) && !excluded.has(id)).sort();
  return { flowIds: [...flow].sort(), simulatorIds: [...simulator].sort(), missingFromSimulator, simulatorOnly, reconciled: missingFromSimulator.length === 0 && simulatorOnly.length === 0 };
}
