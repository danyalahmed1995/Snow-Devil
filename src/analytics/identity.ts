export function normalizeRepositoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function getCanonicalWorkflowRunId(repoNumericId: number | string | undefined | null, repoFullName: string, runId: number | string): string {
  if (repoNumericId != null && String(repoNumericId).trim() !== '') {
    return `${repoNumericId}:${runId}`;
  }
  return `${normalizeRepositoryName(repoFullName)}:${runId}`;
}

export function getWorkflowRunTimestamp(item: Record<string, any>): string {
  const t = item.run_started_at || item.created_at || item.updated_at;
  if (!t) return new Date().toISOString();
  
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

export interface RepositoryIdentity {
  id: string; // Internal system ID or Node ID
  numericId?: number;
  fullName: string;
}

export function matchesRepository(
  runRepoNumericId: number | string | undefined | null,
  runRepoFullName: string,
  filterRepo: RepositoryIdentity | null | undefined,
  filterId: string
): boolean {
  if (filterId === 'all') return true;
  if (!filterRepo) {
      // Fallback if we only have the filter string
      return normalizeRepositoryName(runRepoFullName) === normalizeRepositoryName(filterId);
  }
  
  // Exact match on numeric ID
  if (runRepoNumericId != null && filterRepo.numericId != null && String(runRepoNumericId) === String(filterRepo.numericId)) {
    return true;
  }
  
  // Fallback to normalized full name
  return normalizeRepositoryName(runRepoFullName) === normalizeRepositoryName(filterRepo.fullName);
}
