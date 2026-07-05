import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { createDemoAnalyticsDataset } from '../analytics/demo-data';
import { analyticsDatasetFromSimulatorEvents } from '../analytics/live-adapter';
import type { AnalyticsDataset } from '../analytics/types';
import type { SimulatorEvent } from '../simulator/simulator-types';
import { useModeStore } from '../stores/mode-store';
import { useAuthStore } from '../stores/auth-store';
import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp } from '../analytics/identity';

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

interface RepositoryRow { id: string; databaseId?: string | number; name: string; url?: string; viewerPermission?: string; ownerLogin?: string; fork?: boolean; archived?: boolean; private?: boolean; template?: boolean; empty?: boolean }
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

export function normalizeEvent(row: DbSimulatorEvent): SimulatorEvent | null {
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

export function analyticsRecordEvents(row: AnalyticsRecordRow): SimulatorEvent[] {
  const data = parseJsonObject(row.payload_json);
  const [owner, name] = row.repository_id.split('/');
  const number = typeof data.number === 'number' ? data.number : undefined;
  const author = data.user ?? data.actor ?? data.author;
  const common = { id: `analytics:${row.source_type}:${row.source_id}`, repositoryId: row.repository_id, repositoryName: name ?? row.repository_id, repositoryOwner: owner ?? '', subjectId: row.source_id, subjectNumber: number, occurredAt: String(data.updated_at ?? data.created_at ?? row.updated_at), actor: author && typeof author === 'object' ? author as SimulatorEvent['actor'] : undefined, source: row.source_type.startsWith('current_') ? 'github-current-state' : 'analytics_sync', sourceCompleteness: 'complete' as const };
  if (row.source_type === 'current_issue') {
    if (data.pull_request) return [];
    return [{ ...common, subjectType: 'issue', subjectTitle: String(data.title ?? ''), eventType: String(data.state).toLowerCase() === 'closed' ? 'closed' : 'reopened', metadata: { state: data.state, actualCreatedAt: data.created_at, actualUpdatedAt: data.updated_at, url: data.html_url, currentSnapshot: true } }];
  }
  if (row.source_type === 'current_pull_request') { const head = data.head as Record<string, unknown> | undefined; const base = data.base as Record<string, unknown> | undefined; const headRepo = head?.repo as Record<string, unknown> | undefined; const baseRepo = base?.repo as Record<string, unknown> | undefined; const currentState = String(data.state).toLowerCase(); const eventType: SimulatorEvent['eventType'] = data.merged_at ? 'merged' : currentState === 'closed' ? 'closed' : data.draft ? 'converted_to_draft' : 'reopened'; return [{ ...common, subjectType: 'pull_request', subjectTitle: String(data.title ?? ''), eventType, metadata: { state: data.state, draft: data.draft, actualCreatedAt: data.created_at, actualUpdatedAt: data.updated_at, url: data.html_url, headBranch: head?.ref, baseBranch: base?.ref, headRepository: headRepo?.full_name, headIsFork: headRepo?.fork, baseRepository: baseRepo?.full_name, mergeable: data.mergeable_state ?? data.mergeable, mergedAt: data.merged_at, currentSnapshot: true } }]; }
  if (row.source_type === 'issue_or_pull_request') {
    if (data.pull_request) return [];
    return [{ ...common, subjectType: 'issue', subjectTitle: String(data.title ?? ''), eventType: String(data.state).toLowerCase() === 'closed' ? 'closed' : 'opened', metadata: { state: data.state } }];
  }
  if (row.source_type === 'pull_request') return [{ ...common, subjectType: 'pull_request', subjectTitle: String(data.title ?? ''), occurredAt: String(data.merged_at ?? data.closed_at ?? data.updated_at ?? row.updated_at), eventType: data.merged_at ? 'merged' : String(data.state).toLowerCase() === 'closed' ? 'closed' : 'opened', metadata: { state: data.state, draft: data.draft, branchName: (data.head as Record<string, unknown>)?.ref, baseBranch: (data.base as Record<string, unknown>)?.ref, mergedAt: data.merged_at } }];
  if (row.source_type === 'branch') return [{ ...common, subjectType: 'branch', subjectTitle: String(data.name ?? ''), eventType: 'created', metadata: { branchName: data.name, headSha: (data.commit as Record<string, unknown>)?.sha, estimated: true }, sourceCompleteness: 'partial' }];
    if (row.source_type === 'workflow_run') {
      const author = data.actor ?? data.triggering_actor;
      const commit = data.head_commit as Record<string, unknown> | undefined;
      const pullRequests = Array.isArray(data.pull_requests) ? data.pull_requests : [];
      const repoNumericId = (data.repository as any)?.id;
      const canonicalId = getCanonicalWorkflowRunId(repoNumericId, row.repository_id, data.id as string | number ?? row.source_id);
      
      const occurredAt = getWorkflowRunTimestamp(data);
      let durationMs: number | undefined;
      if (typeof data.run_started_at === 'string' && typeof data.updated_at === 'string') {
        const startMs = Date.parse(data.run_started_at);
        const endMs = Date.parse(data.updated_at);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) durationMs = endMs - startMs;
      }

      return [{
        ...common,
        id: `workflow_run:${canonicalId}`,
        subjectType: 'workflow_run',
        subjectTitle: String(data.name ?? data.display_title ?? 'Workflow run'),
        eventType: data.status !== 'completed' ? 'workflow_started' : data.conclusion === 'success' ? 'workflow_succeeded' : data.conclusion === 'cancelled' ? 'workflow_cancelled' : 'workflow_failed',
        occurredAt,
        actor: author && typeof author === 'object' ? author as SimulatorEvent['actor'] : common.actor,
        metadata: {
          repositoryNumericId: repoNumericId,
          checkState: data.conclusion ?? data.status,
          status: data.status,
          conclusion: data.conclusion,
          headBranch: data.head_branch,
          headSha: data.head_sha,
          commitMessage: typeof commit?.message === 'string' ? commit.message : undefined,
          workflowId: data.workflow_id == null ? undefined : String(data.workflow_id),
          workflowPath: data.path,
          runId: String(data.id ?? row.source_id),
          runNumber: data.run_number,
          runAttempt: data.run_attempt,
          event: data.event,
          htmlUrl: data.html_url,
          startedAt: data.run_started_at,
          completedAt: data.status === 'completed' ? data.updated_at : undefined,
          durationMs,
          pullRequestNumber: pullRequests.length > 0 && pullRequests[0] && typeof (pullRequests[0] as any).number === 'number' ? (pullRequests[0] as any).number : undefined,
        }
      }];
    }
  if (row.source_type === 'check_run') {const metadata={checkState:data.conclusion??data.status,headSha:data.head_sha,externalId:data.external_id,checkRunId:row.source_id,checkName:data.name,required:typeof data.required==='boolean'?data.required:undefined};const values:SimulatorEvent[]=[];if(typeof data.started_at==='string')values.push({...common,id:`${common.id}:started`,subjectType:'check_suite',subjectTitle:String(data.name??'Check run'),occurredAt:data.started_at,eventType:'check_started',metadata});if(typeof data.completed_at==='string')values.push({...common,id:`${common.id}:completed`,subjectType:'check_suite',subjectTitle:String(data.name??'Check run'),occurredAt:data.completed_at,eventType:data.conclusion==='success'?'check_succeeded':data.conclusion==='cancelled'?'check_cancelled':'check_failed',metadata});if(values.length===0)values.push({...common,subjectType:'check_suite',subjectTitle:String(data.name??'Check run'),eventType:data.status==='queued'?'check_queued':'check_started',metadata});return values;}
  if (row.source_type === 'release') return [{ ...common, subjectType: 'release', subjectTitle: String(data.name ?? data.tag_name ?? 'Release'), occurredAt: String(data.published_at ?? data.created_at ?? row.updated_at), eventType: data.draft ? 'release_drafted' : data.prerelease ? 'prereleased' : 'released', metadata: { tagName: data.tag_name, targetCommitish: data.target_commitish } }];
  if (row.source_type === 'deployment') return [{ ...common, subjectType: 'deployment', subjectTitle: String(data.environment ?? data.ref ?? 'Deployment'), eventType: 'deployment_created', metadata: { environment: data.environment, sha: data.sha, ref: data.ref } }];
  return [];
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
      const syncedEvents = analyticsRows.flatMap(analyticsRecordEvents);
      const syncedRepositories = analyticsRows.filter(row => row.source_type === 'repository').map(row => { const value = parseJsonObject(row.payload_json); const permissions = value.permissions as Record<string, unknown> | undefined; const viewerPermission = permissions?.admin ? 'ADMIN' : permissions?.maintain ? 'MAINTAIN' : permissions?.push ? 'WRITE' : permissions?.triage ? 'TRIAGE' : permissions?.pull ? 'READ' : 'UNKNOWN'; const owner = value.owner as Record<string, unknown> | undefined; return { id: row.repository_id, databaseId: typeof value.id === 'number' || typeof value.id === 'string' ? value.id : undefined, name: typeof value.full_name === 'string' ? value.full_name : row.repository_id, url: typeof value.html_url === 'string' ? value.html_url : undefined, viewerPermission, ownerLogin: typeof owner?.login === 'string' ? owner.login : row.repository_id.split('/')[0], fork: value.fork === true, archived: value.archived === true, private: value.private === true, template: value.is_template === true, empty: value.size === 0 }; });
      const eventMap = new Map<string, SimulatorEvent>();
      const allEvents = [...rows.map(normalizeEvent).filter((event): event is SimulatorEvent => event !== null), ...syncedEvents];

      for (const event of allEvents) {
        let key = event.id;
        if (event.subjectType === 'workflow_run' && !key.startsWith('workflow_run:')) {
            const runId = (event.metadata as any)?.runId;
            if (runId) {
                const numericId = (event.metadata as any)?.repositoryNumericId;
                key = `workflow_run:${getCanonicalWorkflowRunId(numericId, event.repositoryName, runId)}`;
                event.id = key;
            }
        }
        
        if (eventMap.has(key)) {
            const existing = eventMap.get(key)!;
            // Retain most recent updated_at/occurredAt and merge metadata
            if (new Date(event.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()) {
                eventMap.set(key, { ...existing, ...event, metadata: { ...existing.metadata, ...event.metadata } });
            } else {
                eventMap.set(key, { ...event, ...existing, metadata: { ...event.metadata, ...existing.metadata } });
            }
        } else {
            eventMap.set(key, event);
        }
      }
      const repositoryMap = new Map([...repositories, ...syncedRepositories].map(repository => [repository.id, repository]));
      return analyticsDatasetFromSimulatorEvents([...eventMap.values()], [...repositoryMap.values()], new Date().toISOString(), login!);
    },
  });
  if (mode === 'demo') {
    return { data: demoDataset, isLoading: false, isFetching: false, error: null, refetch: async () => ({ data: demoDataset }), mode };
  }
  return { ...liveQuery, mode };
}

