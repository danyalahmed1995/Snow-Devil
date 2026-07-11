import { invoke } from '@tauri-apps/api/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { demoPullRequest } from '../repository/demo-repository';
import { useModeStore } from '../stores/mode-store';

export interface PullRequestData extends Omit<typeof demoPullRequest, 'baseRefName' | 'headRefName' | 'baseRefOid' | 'headRefOid'> {
  baseRefName?: string;
  headRefName?: string;
  baseRefOid?: string;
  headRefOid?: string;
  diffTruncated?: boolean;
}

export const pullRequestDetailsQueryRoot = (repository: string, number: number) =>
  ['pull-request-details', repository.toLowerCase(), number] as const;

export const pullRequestDetailsQueryKey = (repository: string, number: number, observedHeadSha?: string) =>
  [...pullRequestDetailsQueryRoot(repository, number), observedHeadSha || 'head-unsynchronized'] as const;

export function usePullRequestDetails(repository: string, number: number, observedHeadSha?: string) {
  const mode = useModeStore(state => state.mode);
  const [owner, name] = repository.split('/');
  return useQuery({
    queryKey: pullRequestDetailsQueryKey(repository, number, observedHeadSha),
    queryFn: () => mode === 'demo'
      ? Promise.resolve(demoPullRequest as PullRequestData)
      : invoke<PullRequestData>('get_pr_details', { owner, name, number }),
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
