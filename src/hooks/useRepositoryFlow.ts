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
      const data = await invoke('get_repository_flow', { owner, name });
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    enabled,
  });
}
