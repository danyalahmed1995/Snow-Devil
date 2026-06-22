import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { createDemoAnalyticsDataset } from '../analytics/demo-data';
import { analyticsDatasetFromSimulatorEvents } from '../analytics/live-adapter';
import type { AnalyticsDataset } from '../analytics/types';
import type { SimulatorEvent } from '../simulator/simulator-types';
import { useModeStore } from '../stores/mode-store';
import { useAuthStore } from '../stores/auth-store';

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
interface AnalyticsRecordRow { repository_id: string; source_type: string; source_id: string; updated_at: string; payload_json: string }

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

function analyticsRecordEvent(row: AnalyticsRecordRow): SimulatorEvent | null {
  const data = parseJsonObject(row.payload_json);
  const [owner, name] = row.repository_id.split('/');
  const number = typeof data.number === 'number' ? data.number : undefined;
  const common = { id: `analytics:${row.source_type}:${row.source_id}`, repositoryId: row.repository_id, repositoryName: name ?? row.repository_id, repositoryOwner: owner ?? '', subjectId: row.source_id, subjectNumber: number, occurredAt: String(data.updated_at ?? data.created_at ?? row.updated_at), actor: data.actor && typeof data.actor === 'object' ? data.actor as SimulatorEvent['actor'] : undefined, source: 'analytics_sync', sourceCompleteness: 'complete' as const };
  if (row.source_type === 'issue_or_pull_request') {
    if (data.pull_request) return null;
    return { ...common, subjectType: 'issue', subjectTitle: String(data.title ?? ''), eventType: String(data.state).toLowerCase() === 'closed' ? 'closed' : 'opened', metadata: { state: data.state } };
  }
  if (row.source_type === 'pull_request') return { ...common, subjectType: 'pull_request', subjectTitle: String(data.title ?? ''), occurredAt: String(data.merged_at ?? data.closed_at ?? data.updated_at ?? row.updated_at), eventType: data.merged_at ? 'merged' : String(data.state).toLowerCase() === 'closed' ? 'closed' : 'opened', metadata: { state: data.state, draft: data.draft, branchName: (data.head as Record<string, unknown>)?.ref, baseBranch: (data.base as Record<string, unknown>)?.ref, mergedAt: data.merged_at } };
  if (row.source_type === 'branch') return { ...common, subjectType: 'branch', subjectTitle: String(data.name ?? ''), eventType: 'created', metadata: { branchName: data.name, headSha: (data.commit as Record<string, unknown>)?.sha, estimated: true }, sourceCompleteness: 'partial' };
  if (row.source_type === 'workflow_run') return { ...common, subjectType: 'workflow_run', subjectTitle: String(data.name ?? data.display_title ?? 'Workflow run'), eventType: data.status !== 'completed' ? 'workflow_started' : data.conclusion === 'success' ? 'workflow_succeeded' : data.conclusion === 'cancelled' ? 'workflow_cancelled' : 'workflow_failed', metadata: { checkState: data.conclusion ?? data.status, headBranch: data.head_branch, headSha: data.head_sha } };
  if (row.source_type === 'check_run') return { ...common, subjectType: 'check_suite', subjectTitle: String(data.name ?? 'Check run'), occurredAt: String(data.completed_at ?? data.started_at ?? row.updated_at), eventType: data.status !== 'completed' ? data.status === 'queued' ? 'check_queued' : 'check_started' : data.conclusion === 'success' ? 'check_succeeded' : data.conclusion === 'cancelled' ? 'check_cancelled' : 'check_failed', metadata: { checkState: data.conclusion ?? data.status, headSha: data.head_sha, externalId: data.external_id } };
  if (row.source_type === 'release') return { ...common, subjectType: 'release', subjectTitle: String(data.name ?? data.tag_name ?? 'Release'), occurredAt: String(data.published_at ?? data.created_at ?? row.updated_at), eventType: data.draft ? 'release_drafted' : data.prerelease ? 'prereleased' : 'released', metadata: { tagName: data.tag_name, targetCommitish: data.target_commitish } };
  if (row.source_type === 'deployment') return { ...common, subjectType: 'deployment', subjectTitle: String(data.environment ?? data.ref ?? 'Deployment'), eventType: 'deployment_created', metadata: { environment: data.environment, sha: data.sha, ref: data.ref } };
  return null;
}

export function useAnalyticsData() {
  const mode = useModeStore(state => state.mode);
  const session = useAuthStore(state => state.session);
  const login = session.status === 'connected' ? session.account.login : null;
  const demoRevision = useModeStore(state => state.demoRevision);
  const demoDataset = useMemo(() => {
    void demoRevision;
    return createDemoAnalyticsDataset();
  }, [demoRevision]);
  const liveQuery = useQuery({
    queryKey: ['delivery-analytics', 'cached-history', login],
    enabled: mode === 'live' && Boolean(login),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AnalyticsDataset> => {
      const [rows, repositories, analyticsRows] = await Promise.all([
        invoke<DbSimulatorEvent[]>('get_simulator_events', { repositoryId: null }),
        invoke<RepositoryRow[]>('get_all_repositories'),
        invoke<AnalyticsRecordRow[]>('get_analytics_records', { accountLogin: login! }),
      ]);
      const syncedEvents = analyticsRows.map(analyticsRecordEvent).filter((event): event is SimulatorEvent => event !== null);
      const syncedRepositories = analyticsRows.filter(row => row.source_type === 'repository').map(row => { const value = parseJsonObject(row.payload_json); return { id: row.repository_id, name: row.repository_id, url: typeof value.html_url === 'string' ? value.html_url : undefined }; });
      const eventMap = new Map([...rows.map(normalizeEvent).filter((event): event is SimulatorEvent => event !== null), ...syncedEvents].map(event => [event.id, event]));
      const repositoryMap = new Map([...repositories, ...syncedRepositories].map(repository => [repository.id, repository]));
      return analyticsDatasetFromSimulatorEvents([...eventMap.values()], [...repositoryMap.values()]);
    },
  });
  if (mode === 'demo') {
    return { data: demoDataset, isLoading: false, isFetching: false, error: null, refetch: async () => ({ data: demoDataset }), mode };
  }
  return { ...liveQuery, mode };
}
