import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

interface ApiResponse {
  status: number;
  body: unknown;
  rate_remaining?: number;
  rate_reset?: number;
  next_page?: number;
}

export interface RepositoryBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export function useRepositoryBranches(repositoryId: string | null) {
  return useQuery({
    queryKey: ['repository_branches', repositoryId],
    enabled: Boolean(repositoryId) && repositoryId !== 'all',
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (String(error).includes('403') || String(error).includes('404')) return false;
      return failureCount < 2;
    },
    queryFn: async (): Promise<RepositoryBranch[]> => {
      if (!repositoryId || repositoryId === 'all') return [];
      const [owner, repo] = repositoryId.split('/');
      let branches: RepositoryBranch[] = [];
      let page = 1;
      
      while (page <= 5) {
        const endpoint = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/branches?per_page=100&page=' + page;
        const response = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint });
        
        if (response.status === 404) throw new Error('not_found');
        if (response.status === 403) throw new Error('forbidden');
        if (response.status >= 400) throw new Error('github_error_' + response.status);
        
        const body = response.body as RepositoryBranch[];
        if (Array.isArray(body)) {
          branches = branches.concat(body);
        }
        
        if (response.next_page && response.next_page > page) {
          page = response.next_page;
        } else {
          break;
        }
      }
      return branches;
    },
  });
}
