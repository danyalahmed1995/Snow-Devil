import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp } from '../analytics/identity';
import { useAuthStore } from '../stores/auth-store';

export interface WorkflowJob {
  id: number;
  run_id: number;
  workflow_name: string;
  head_branch: string;
  run_url: string;
  node_id: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  started_at: string;
  completed_at: string | null;
  url: string;
  html_url: string;
  steps: Array<{
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
    number: number;
    started_at: string | null;
    completed_at: string | null;
  }>;
}

interface ApiResponse {
  status: number;
  body: unknown;
  rate_remaining?: number;
  rate_reset?: number;
}

export function useWorkflowJobs(repositoryId: string, runId: string, enabled: boolean, isActive?: boolean) {
  return useQuery({
    queryKey: ['workflow_jobs', repositoryId, runId],
    enabled: enabled && Boolean(repositoryId) && Boolean(runId),
    staleTime: isActive ? 5000 : 60 * 1000,
    refetchInterval: isActive ? 10000 : false,
    retry: (failureCount, error) => {
      if (String(error).includes('403') || String(error).includes('404')) return false;
      return failureCount < 3;
    },
    queryFn: async (): Promise<WorkflowJob[]> => {
      const [owner, repo] = repositoryId.split('/');
      const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`;
      const response = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint });
      if (response.status === 404) throw new Error('not_found');
      if (response.status === 403) throw new Error('forbidden');
      if (response.status >= 400) throw new Error(`github_error_${response.status}`);
      
      const body = response.body as { jobs: WorkflowJob[] };
      const jobs = body?.jobs ?? [];

      // If the workflow run is active, also pull its latest status and sync it to the DB so the dashboard row updates in real-time
      if (isActive) {
        const runEndpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}`;
        const runRes = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint: runEndpoint }).catch(() => null);
        if (runRes && runRes.status === 200) {
          const runData = runRes.body as any;
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
            import('../app/providers').then(m => m.queryClient.invalidateQueries({ queryKey: ['delivery-analytics'] })).catch(() => {});
          }
        }
      }

      return jobs;
    },
  });
}

