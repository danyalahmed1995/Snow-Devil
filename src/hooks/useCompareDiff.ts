import { invoke } from '@tauri-apps/api/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useModeStore } from '../stores/mode-store';

export const compareDiffQueryRoot = (repository: string, base: string, head: string) =>
  ['compare-diff', repository.toLowerCase(), base, head] as const;

export function useCompareDiff(repository: string, base: string, head: string, enabled: boolean = true) {
  const mode = useModeStore(state => state.mode);
  const [owner, name] = repository.split('/');
  return useQuery({
    queryKey: compareDiffQueryRoot(repository, base, head),
    queryFn: () => {
      if (mode === 'demo' || base === head) {
        return Promise.resolve('');
      }
      return invoke<string>('get_compare_diff', { owner, name, base, head });
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    enabled: enabled && Boolean(base && head && owner && name),
  });
}
