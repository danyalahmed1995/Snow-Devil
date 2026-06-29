import type { HistoricalDepth, SimulatorLoadDetails, SimulatorLoadState } from './simulator-types';

export type SourceCompleteness = 'all_loaded' | 'partial' | 'failed' | 'unsupported' | 'loading';

export interface HistoryStatusSummary {
  sourceCompleteness: SourceCompleteness;
  historicalDepth: HistoricalDepth;
  loaded: number;
  partial: number;
  failed: number;
  unsupported: number;
  skipped: number;
  sourceLabel: string;
  depthLabel: string;
  headline: string;
}

const DEPTH_LABELS: Record<HistoricalDepth, string> = {
  full_available: 'Full available history',
  retention_bounded: 'Limited historical depth',
  api_bounded: 'GitHub API/search bounded',
  current_only: 'Current state only',
  partial_events: 'Partial event history',
};

export function summarizeHistoryStatus(loadState: SimulatorLoadState, details: SimulatorLoadDetails): HistoryStatusSummary {
  const statuses = details.sourceStatuses ?? [];
  const loaded = statuses.length ? statuses.filter(source => source.status === 'loaded').length : details.loadedSources;
  const partial = statuses.filter(source => source.status === 'partial').length;
  const failed = statuses.length ? statuses.filter(source => source.status === 'failed').length : details.sourceFailures.length;
  const unsupported = statuses.filter(source => source.status === 'unsupported').length;
  const skipped = statuses.filter(source => source.status === 'skipped').length;
  const historicalDepth = details.historicalDepth ?? (partial || failed ? 'partial_events' : 'retention_bounded');
  const sourceCompleteness: SourceCompleteness = loadState === 'idle' || loadState === 'loading_initial' ? 'loading'
    : failed > 0 ? 'failed'
    : unsupported > 0 ? 'unsupported'
    : partial > 0 || loaded < details.totalSources ? 'partial'
    : 'all_loaded';
  const sourceLabel = sourceCompleteness === 'all_loaded' ? 'All sources loaded'
    : sourceCompleteness === 'loading' ? 'Loading sources'
    : `${loaded} of ${details.totalSources} sources loaded · ${failed ? `${failed} failed` : partial ? `${partial} partial` : `${unsupported} unsupported`}`;
  const depthLabel = details.historicalDepthMessage ?? DEPTH_LABELS[historicalDepth];
  const prefix = historicalDepth === 'current_only' ? 'Current state ready' : 'History ready';
  return { sourceCompleteness, historicalDepth, loaded, partial, failed, unsupported, skipped, sourceLabel, depthLabel, headline: `${prefix} · ${sourceLabel} · ${depthLabel}` };
}
