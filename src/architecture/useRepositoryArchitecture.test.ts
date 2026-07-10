import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchitectureSnapshot } from './types';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const cached: ArchitectureSnapshot = { repositoryId: 'acme/repo', baseCommitSha: 'abc', generatedAt: '2026-07-10T00:00:00Z', algorithmVersion: 1, status: 'ready', components: [], dependencies: [], files: [], unmappedFiles: [], excludedPaths: [], warnings: [], evidenceSummary: { mappedFiles: 0, totalFiles: 0, configured: false, manifestCount: 0, dependencyEvidenceCount: 0, ownedFiles: 0, requestCount: 0, exclusions: [] } };

describe('repository architecture cache loading', () => {
  beforeEach(() => invoke.mockReset());

  it('uses an exact cached snapshot without fetching the GitHub tree', async () => {
    invoke.mockResolvedValueOnce(cached);
    const { loadRepositoryArchitectureSnapshot } = await import('./useRepositoryArchitecture');
    await expect(loadRepositoryArchitectureSnapshot('acme/repo', 'abc', false)).resolves.toEqual(cached);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('get_architecture_snapshot', expect.objectContaining({ repositoryId: 'acme/repo', baseCommitSha: 'abc' }));
    expect(invoke).not.toHaveBeenCalledWith('fetch_repository_architecture_input', expect.anything());
  });

  it('builds and saves a snapshot after a cache miss', async () => {
    invoke.mockResolvedValueOnce(null).mockResolvedValueOnce({ repositoryId: 'acme/repo', baseCommitSha: 'abc', truncated: false, files: [{ path: 'package.json' }, { path: 'src/main.ts' }], contents: { 'package.json': '{}' }, requestCount: 2, excludedPaths: [], warnings: [], stages: ['Ready'] }).mockResolvedValueOnce(undefined);
    const { loadRepositoryArchitectureSnapshot } = await import('./useRepositoryArchitecture');
    const result = await loadRepositoryArchitectureSnapshot('acme/repo', 'abc', false);
    expect(result.status).toBe('ready');
    expect(invoke).toHaveBeenNthCalledWith(2, 'fetch_repository_architecture_input', { repositoryId: 'acme/repo', baseCommitSha: 'abc' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_architecture_snapshot', expect.objectContaining({ repositoryId: 'acme/repo', baseCommitSha: 'abc' }));
  });
});
