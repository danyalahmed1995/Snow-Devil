import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { useModeStore } from '../stores/mode-store';
import { demoAllEntries, demoFile } from '../repository/demo-repository';
import { ARCHITECTURE_ALGORITHM_VERSION } from './feature';
import { buildRepositoryArchitectureSnapshot } from './repository-analyze';
import type { ArchitectureSnapshot, RepositoryArchitectureInput } from './types';

export const architectureSnapshotKey = (repositoryId: string, baseCommitSha: string) => ['architecture-snapshot', repositoryId, baseCommitSha, ARCHITECTURE_ALGORITHM_VERSION] as const;

function demoInput(repositoryId: string, baseCommitSha: string): RepositoryArchitectureInput {
  const entries = demoAllEntries().filter(entry => entry.type === 'blob');
  const contents = Object.fromEntries(entries.flatMap(entry => {
    const file = demoFile(entry.path);
    return typeof file?.text === 'string' ? [[entry.path, file.text]] : [];
  }));
  return { repositoryId, baseCommitSha, truncated: false, files: entries.map(entry => ({ path: entry.path, size: demoFile(entry.path)?.byteSize })), contents, requestCount: 0, excludedPaths: [], warnings: [], stages: ['Ready'] };
}

export async function loadRepositoryArchitectureSnapshot(repositoryId: string, baseCommitSha: string, demo: boolean): Promise<ArchitectureSnapshot> {
  if (demo) return buildRepositoryArchitectureSnapshot(demoInput(repositoryId, baseCommitSha));
  const cached = await invoke<ArchitectureSnapshot | null>('get_architecture_snapshot', { repositoryId, baseCommitSha, algorithmVersion: ARCHITECTURE_ALGORITHM_VERSION, configHash: null });
  if (cached) return cached;
  const input = await invoke<RepositoryArchitectureInput>('fetch_repository_architecture_input', { repositoryId, baseCommitSha });
  const snapshot = buildRepositoryArchitectureSnapshot(input);
  await invoke('save_architecture_snapshot', { repositoryId, baseCommitSha, algorithmVersion: snapshot.algorithmVersion, configHash: snapshot.configHash ?? null, status: snapshot.status, generatedAt: snapshot.generatedAt, payload: snapshot }).catch(error => console.warn('[Architecture Context] Snapshot cache write failed', error));
  return snapshot;
}

export function useRepositoryArchitecture(repositoryId: string, baseCommitSha?: string, enabled = true, allowStale = false) {
  const mode = useModeStore(state => state.mode);
  return useQuery({
    queryKey: architectureSnapshotKey(repositoryId, baseCommitSha ?? ''),
    queryFn: () => loadRepositoryArchitectureSnapshot(repositoryId, baseCommitSha!, mode === 'demo'),
    enabled: enabled && Boolean(repositoryId && baseCommitSha),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    placeholderData: allowStale ? previous => previous ? { ...previous, status: 'stale' as const } : undefined : undefined,
  });
}
