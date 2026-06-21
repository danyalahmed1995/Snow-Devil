import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function useHomeSummary() {
  return useQuery({
    queryKey: ['homeSummary'],
    queryFn: async () => {
      const data = await invoke('get_account_home_summary');
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
