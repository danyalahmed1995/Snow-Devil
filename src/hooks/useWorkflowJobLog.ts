import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface JobLogResponse {
  status: number;
  text: string | null;
  truncated: boolean;
  error_kind: string | null;
}

export function useWorkflowJobLog(repositoryId: string, jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ciJobLog', repositoryId, jobId],
    enabled: Boolean(repositoryId) && Boolean(jobId) && enabled,
    staleTime: Infinity, // don't auto-refetch logs blindly
    queryFn: async (): Promise<JobLogResponse> => {
      const res = await invoke<JobLogResponse>('analytics_fetch_job_log', {
        repository: repositoryId,
        jobId: parseInt(jobId, 10)
      });
      return res;
    },
  });
}
