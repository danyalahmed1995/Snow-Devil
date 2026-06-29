import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

interface UseRepositoryFlowParams {
  owner: string;
  name: string;
  enabled: boolean;
}

export function useRepositoryFlow({ owner, name, enabled }: UseRepositoryFlowParams) {
  return useQuery({
    queryKey: ['repositoryFlow', owner, name],
    queryFn: async () => {
      const request = (sourceType: 'open_prs' | 'open_issues' | 'merged_prs') => invoke<any>('get_source_page', { req: { scope: 'repository', sourceType, repositoryOwner: owner, repositoryName: name, pageSize: 100, cursor: null } });
      const [open, issues, merged] = await Promise.all([request('open_prs'), request('open_issues'), request('merged_prs')]);
      return { pullRequests: open?.pullRequests, issues: issues?.issues, mergedPrs: merged?.pullRequests };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    enabled,
  });
}
