import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, type ConnectedAccount } from '../stores/auth-store';
import { useModeStore } from '../stores/mode-store';

export type AccountRepositoryOwnership = 'personal' | 'organization' | 'collaborator';
export type AccountRepositoryAccess = 'maintained' | 'triage' | 'read_only';

export interface AccountRepository {
  id: string;
  nameWithOwner: string;
  description?: string | null;
  updatedAt?: string;
  url?: string;
  isPrivate?: boolean;
  isFork?: boolean;
  isArchived?: boolean;
  isEmpty?: boolean;
  isTemplate?: boolean;
  viewerPermission?: string;
  defaultBranch?: string | null;
  ownerLogin?: string;
  ownerType?: string;
  ownership?: AccountRepositoryOwnership;
  accessKind?: AccountRepositoryAccess;
  maintainedByViewer?: boolean;
}

export type AccountOrganization = NonNullable<NonNullable<ConnectedAccount['organizations']>['nodes']>[number];

export const accountRepositoriesQueryKey = (login: string) => ['account-context', login, 'repositories'] as const;

export async function fetchAccountRepositories(): Promise<AccountRepository[]> {
  const repositories = await invoke<AccountRepository[]>('get_viewer_repositories');
  return [...(repositories ?? [])].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') || left.nameWithOwner.localeCompare(right.nameWithOwner));
}

export function useAccountRepositories() {
  const mode = useModeStore(state => state.mode);
  const session = useAuthStore(state => state.session);
  const login = session.status === 'connected' ? session.account.login : '';
  return useQuery({
    queryKey: accountRepositoriesQueryKey(login),
    queryFn: fetchAccountRepositories,
    enabled: mode === 'live' && Boolean(login),
    staleTime: 5 * 60 * 1000,
  });
}

export function activeAccountOrganizations(account?: ConnectedAccount): AccountOrganization[] {
  return account?.organizations?.status === 'unavailable' ? [] : account?.organizations?.nodes ?? [];
}
