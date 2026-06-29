import type { SimulatorEntityState, SimulatorEvent } from './simulator-types';

const ACTIVE_PR_STAGES = new Set(['coding', 'pull_requests', 'review', 'checks', 'ready']);

export function formatSimulatorDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Unavailable';
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes && hours < 12 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours && days < 4 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function deriveSimulatorMetrics(entities: SimulatorEntityState[], events: SimulatorEvent[], partialSourceCount = 0) {
  const pullRequests = entities.filter(entity => entity.subjectType === 'pull_request');
  const issues = entities.filter(entity => entity.subjectType === 'issue');
  const merged = pullRequests.filter(entity => Boolean(entity.mergedAt) || ['merged', 'released', 'deployed'].includes(entity.stage));
  const mergeDurations = merged.flatMap(entity => entity.createdAt && entity.mergedAt ? [new Date(entity.mergedAt).getTime() - new Date(entity.createdAt).getTime()] : []);
  const averageMerge = mergeDurations.length ? formatSimulatorDuration(mergeDurations.reduce((sum, duration) => sum + duration, 0) / mergeDurations.length) : 'Unavailable';
  return {
    openIssues: issues.filter(entity => entity.stage === 'issues' && !['closed', 'merged'].includes(entity.status)).length,
    activePullRequests: pullRequests.filter(entity => ACTIVE_PR_STAGES.has(entity.stage) && !['closed', 'merged'].includes(entity.status)).length,
    mergedPullRequests: merged.length,
    averageMerge,
    failedChecks: pullRequests.filter(entity => entity.checkState === 'failure').length,
    checksPassed: pullRequests.filter(entity => entity.checkState === 'success').length,
    reviewRequested: pullRequests.filter(entity => entity.reviewState === 'requested').length,
    changesRequested: pullRequests.filter(entity => entity.reviewState === 'changes_requested').length,
    releases: entities.filter(entity => entity.subjectType === 'release' || entity.stage === 'released').length,
    deployments: entities.filter(entity => entity.subjectType === 'deployment' || entity.stage === 'deployed').length,
    events: events.length,
    partialSources: partialSourceCount,
  };
}
