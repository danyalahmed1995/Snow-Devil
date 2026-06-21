import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function useAccountFlow() {
  return useQuery({
    queryKey: ['accountFlow'],
    queryFn: async () => {
      const data = await invoke('get_account_flow');
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
