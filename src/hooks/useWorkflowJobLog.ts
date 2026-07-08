import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface JobLogResponse {
  status: number;
  text: string | null;
  truncated: boolean;
  error_kind: string | null;
}

export function useWorkflowJobLog(repositoryId: string, jobId: string, enabled: boolean, isJobActive?: boolean) {
  return useQuery({
    queryKey: ['ciJobLog', repositoryId, jobId],
    enabled: Boolean(repositoryId) && Boolean(jobId) && enabled,
    staleTime: isJobActive ? 5000 : Infinity, // Poll more aggressively when the job is active
    refetchInterval: isJobActive ? 10000 : false, // Poll every 10 seconds while the job is in progress
    gcTime: isJobActive ? 2 * 60 * 1000 : 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<JobLogResponse> => {
      const res = await invoke<JobLogResponse>('analytics_fetch_job_log', {
        repository: repositoryId,
        jobId: parseInt(jobId, 10)
      });
      return res;
    },
  });
}

