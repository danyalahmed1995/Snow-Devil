import type { PullRequestArchitectureImpact, ArchitectureComponent } from './types';

export function getRelevantComponentIds(impact: PullRequestArchitectureImpact): Set<string> {
  const ids = new Set<string>();
  
  if (impact.primaryComponentId) {
    ids.add(impact.primaryComponentId);
  }
  
  for (const item of impact.affectedComponents) {
    ids.add(item.component.id);
  }
  
  for (const id of impact.directBlastRadius) {
    ids.add(id);
  }
  
  for (const id of impact.indirectBlastRadius) {
    ids.add(id);
  }
  
  for (const edge of impact.dependencyChanges) {
    ids.add(edge.fromComponentId);
    ids.add(edge.toComponentId);
  }
  
  return ids;
}

export function getRelevantComponents(impact: PullRequestArchitectureImpact): ArchitectureComponent[] {
  const ids = getRelevantComponentIds(impact);
  return impact.snapshot.components.filter(c => ids.has(c.id));
}

export function calculateHiddenComponentCount(impact: PullRequestArchitectureImpact, visibleNodeIds: Set<string>): number {
  const relevantIds = getRelevantComponentIds(impact);
  let hiddenCount = 0;
  for (const id of relevantIds) {
    if (!visibleNodeIds.has(id)) {
      hiddenCount++;
    }
  }
  return hiddenCount;
}

export function getShortestUniqueQualifier(component: ArchitectureComponent, allComponents: ArchitectureComponent[]): string {
  const duplicates = allComponents.filter(c => c.name === component.name && c.id !== component.id);
  if (duplicates.length === 0) {
    return component.kind; // Default qualifier
  }

  // Find shortest unique root path
  if (component.rootPaths.length > 0) {
    for (const path of component.rootPaths) {
      const isUnique = !duplicates.some(d => d.rootPaths.some(dp => dp === path));
      if (isUnique) return path;
    }
  }

  // Find shortest unique manifest path
  if (component.manifestPaths.length > 0) {
    for (const path of component.manifestPaths) {
      const isUnique = !duplicates.some(d => d.manifestPaths.some(dp => dp === path));
      if (isUnique) return path;
    }
  }

  // Fallback to component ID suffix
  return component.id.slice(0, 8);
}
