import { invoke } from '@tauri-apps/api/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { demoPullRequest } from '../repository/demo-repository';
import { useModeStore } from '../stores/mode-store';
import type { ArchitectureDecisionContext } from '../architecture/types';

export interface PullRequestData extends Omit<typeof demoPullRequest, 'baseRefName' | 'headRefName' | 'baseRefOid' | 'headRefOid'> {
  baseRefName?: string;
  headRefName?: string;
  baseRefOid?: string;
  headRefOid?: string;
  diffTruncated?: boolean;
  architectureDecisionContext?: ArchitectureDecisionContext;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  fallbackFiles?: Array<{
    sha: string;
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    blob_url: string;
    raw_url: string;
    contents_url: string;
    patch?: string;
    previous_filename?: string;
  }>;
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
