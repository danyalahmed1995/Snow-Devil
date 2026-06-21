import { useInfiniteQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface SourcePageRequest {
  scope: 'account' | 'repository';
  sourceType: 'authored_prs' | 'review_requested_prs' | 'reviewed_prs' | 'authored_issues' | 'assigned_issues' | 'merged_prs' | 'open_prs' | 'open_issues' | 'releases';
  repositoryOwner?: string;
  repositoryName?: string;
  cursor?: string;
  pageSize: number;
}

export function useInfiniteSource(request: Omit<SourcePageRequest, 'cursor'> & { enabled?: boolean; mode?: 'live' | 'replay'; timeRange?: string; filters?: any }) {
  const { enabled = true, mode = 'live', timeRange = '24h', filters = {}, ...req } = request;

  const repoId = req.repositoryOwner && req.repositoryName ? `${req.repositoryOwner}/${req.repositoryName}` : null;

  return useInfiniteQuery({
    queryKey: ['flow', req.scope, mode, repoId, req.sourceType, filters, timeRange],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const data = await invoke('get_source_page', { 
        req: { ...req, cursor: pageParam }
      });
      return data as any;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage: any) => {
      // Handle releases, pullRequests, issues (native queries) and search queries
      const pageInfo = lastPage?.releases?.pageInfo || 
                       lastPage?.pullRequests?.pageInfo || 
                       lastPage?.issues?.pageInfo || 
                       lastPage?.search?.pageInfo;
      return pageInfo?.hasNextPage ? pageInfo?.endCursor : undefined;
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
