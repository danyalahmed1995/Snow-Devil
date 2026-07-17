import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { WorkflowJob } from './useWorkflowJobs';
import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp } from '../analytics/identity';
import { useAuthStore } from '../stores/auth-store';
import { fetchPullRequestRiskSnapshot } from '../simulator/simulator-github-api';
import { saveSimulatorEventsToDb } from '../simulator/simulator-cache';
import { useCIWatcherStore } from '../stores/ci-watcher-store';
import { normalizeWorkflowRuns } from '../ci/ci-watcher';

interface ApiResponse {
  status: number;
  body: unknown;
}

export interface WorkflowRunDetails {
  id: number;
  name: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | null;
  head_branch: string;
  head_sha: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  repository: {
    id: number;
    full_name: string;
  };
  actor: {
    login: string;
    avatar_url: string;
  };
  pull_requests: Array<{
    number: number;
    url: string;
  }>;
}

export interface RunWatcherState {
  run: WorkflowRunDetails;
  jobs: WorkflowJob[];
}

export function isRunTerminal(status: string, conclusion: string | null): boolean {
  if (status === 'completed') return true;
  if (conclusion && conclusion !== 'neutral') return true;
  return false;
}

export function useWorkflowRunWatcher(repositoryId: string, runId: string, attemptNumber?: number, isForeground?: boolean, canFetch = true) {
  const [owner, repo] = repositoryId.split('/');
  const hasCanonicalIdentity = Boolean(owner && repo && runId);
  return useQuery({
    queryKey: ['ciRunWatcher', repositoryId, runId, attemptNumber],
    enabled: canFetch && hasCanonicalIdentity,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && isRunTerminal(data.run.status, data.run.conclusion)) {
        return false;
      }
      return isForeground ? 5000 : 25000;
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    queryFn: async (): Promise<RunWatcherState> => {
      const runEndpoint = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/actions/runs/' + encodeURIComponent(runId);
      const runRes = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint: runEndpoint });
      
      if (runRes.status >= 400) {
        const msg = String((runRes.body as any)?.message || '').toLowerCase();
        if (runRes.status === 403 && !msg.includes('rate limit')) {
          throw new Error('missing_workflow_scope');
        }
        throw new Error('github_error_' + runRes.status);
      }
      const runData = runRes.body as WorkflowRunDetails;
      
      const store = useCIWatcherStore.getState();
      const repoKey = repositoryId.toLowerCase();
      const existing = store.runsByRepository[repoKey] ?? [];
      const normalizedRun = normalizeWorkflowRuns(repositoryId, { workflow_runs: [runData] })[0];
      if (normalizedRun) {
        let found = false;
        const updatedRuns = existing.map(r => {
          if (r.runId.toString() === runData.id.toString()) {
            found = true;
            return normalizedRun;
          }
          return r;
        });
        if (!found) updatedRuns.unshift(normalizedRun);
        store.setRuns(repositoryId, updatedRuns);
      }

      if (isRunTerminal(runData.status, runData.conclusion)) {
        window.dispatchEvent(new CustomEvent('snow-devil:ci-refresh'));
      }
      
      // Save the updated run status to local DB so dashboard CI Activity is updated in real-time
      const session = useAuthStore.getState().session;
      const login = session.status === 'connected' ? session.account.login : null;
      if (login) {
        const repoNumericId = runData.repository?.id;
        const canonicalId = getCanonicalWorkflowRunId(repoNumericId, repositoryId, runData.id);
        const updated_at = getWorkflowRunTimestamp(runData);
        const record = {
          account_login: login,
          repository_id: repositoryId,
          source_type: 'workflow_run',
          source_id: canonicalId,
          updated_at,
          payload_json: JSON.stringify(runData)
        };
        await invoke('save_analytics_records', { records: [record] }).catch(() => {});
        if (isRunTerminal(runData.status, runData.conclusion) && runData.pull_requests?.length) {
          await Promise.all(runData.pull_requests.map(async pullRequest => {
            const events = await fetchPullRequestRiskSnapshot(repositoryId, pullRequest.number);
            if (events.length) await saveSimulatorEventsToDb(events);
          })).catch(() => {});
        }
        import('../app/providers').then(m => m.queryClient.invalidateQueries({ queryKey: ['delivery-analytics'] })).catch(() => {});
      }

      const jobsEndpoint = (attemptNumber && attemptNumber !== runData.run_attempt)
        ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/attempts/${attemptNumber}/jobs`
        : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/jobs?filter=latest`;
      
      const jobsRes = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint: jobsEndpoint });
      if (jobsRes.status >= 400) {
        const msg = String((jobsRes.body as any)?.message || '').toLowerCase();
        if (jobsRes.status === 403 && !msg.includes('rate limit')) {
          throw new Error('missing_workflow_scope');
        }
        throw new Error('github_error_' + jobsRes.status);
      }
      
      const jobsData = (jobsRes.body as any).jobs as WorkflowJob[];
      
      return {
        run: runData,
        jobs: jobsData || []
      };
    },
  });
}

