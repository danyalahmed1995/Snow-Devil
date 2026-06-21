import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { createDemoAnalyticsDataset } from '../analytics/demo-data';
import { analyticsDatasetFromSimulatorEvents } from '../analytics/live-adapter';
import type { AnalyticsDataset } from '../analytics/types';
import type { SimulatorEvent } from '../simulator/simulator-types';
import { useModeStore } from '../stores/mode-store';

interface DbSimulatorEvent {
  id: string;
  repository_id: string;
  repository_name: string | null;
  repository_owner: string | null;
  subject_id: string;
  subject_type: string | null;
  subject_number: number | null;
  subject_title: string | null;
  event_type: string;
  timestamp: string;
  actor_json: string | null;
  metadata_json: string | null;
  source: string;
  completeness: string;
  inclusion_reason: string | null;
}

interface RepositoryRow { id: string; name: string; url?: string }

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeEvent(row: DbSimulatorEvent): SimulatorEvent | null {
  const repositoryParts = row.repository_id.split('/');
  const validTypes = ['issue', 'pull_request', 'branch', 'commit', 'workflow_run', 'check_suite', 'release', 'deployment'];
  if (!row.subject_type || !validTypes.includes(row.subject_type)) return null;
  return {
    id: row.id,
    repositoryId: row.repository_id,
    repositoryName: row.repository_name ?? repositoryParts[1] ?? row.repository_id,
    repositoryOwner: row.repository_owner ?? repositoryParts[0] ?? '',
    subjectId: row.subject_id,
    subjectType: row.subject_type as SimulatorEvent['subjectType'],
    subjectNumber: row.subject_number ?? undefined,
    subjectTitle: row.subject_title ?? '',
    occurredAt: row.timestamp,
    eventType: row.event_type as SimulatorEvent['eventType'],
    actor: row.actor_json ? parseJsonObject(row.actor_json) as SimulatorEvent['actor'] : undefined,
    metadata: parseJsonObject(row.metadata_json),
    source: row.source,
    sourceCompleteness: ['complete', 'partial', 'unknown'].includes(row.completeness) ? row.completeness as SimulatorEvent['sourceCompleteness'] : 'unknown',
    inclusionReason: row.inclusion_reason as SimulatorEvent['inclusionReason'],
  };
}

export function useAnalyticsData() {
  const mode = useModeStore(state => state.mode);
  const demoRevision = useModeStore(state => state.demoRevision);
  const demoDataset = useMemo(() => {
    void demoRevision;
    return createDemoAnalyticsDataset();
  }, [demoRevision]);
  const liveQuery = useQuery({
    queryKey: ['delivery-analytics', 'cached-history'],
    enabled: mode === 'live',
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AnalyticsDataset> => {
      const [rows, repositories] = await Promise.all([
        invoke<DbSimulatorEvent[]>('get_simulator_events', { repositoryId: null }),
        invoke<RepositoryRow[]>('get_all_repositories'),
      ]);
      return analyticsDatasetFromSimulatorEvents(rows.map(normalizeEvent).filter((event): event is SimulatorEvent => event !== null), repositories);
    },
  });
  if (mode === 'demo') {
    return { data: demoDataset, isLoading: false, isFetching: false, error: null, refetch: async () => ({ data: demoDataset }), mode };
  }
  return { ...liveQuery, mode };
}
