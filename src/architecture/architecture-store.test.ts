import { beforeEach, describe, expect, it } from 'vitest';
import { useArchitectureStore } from './architecture-store';
import type { ArchitectureSnapshot } from './types';

const snapshot: ArchitectureSnapshot = { repositoryId: 'acme/repo', baseCommitSha: 'abc', generatedAt: '2026-07-10T00:00:00Z', algorithmVersion: 2, status: 'ready', components: [], dependencies: [], files: [], unmappedFiles: [], excludedPaths: [], warnings: [], evidenceSummary: { mappedFiles: 0, totalFiles: 0, configured: false, manifestCount: 0, dependencyEvidenceCount: 0, ownedFiles: 0, requestCount: 0, exclusions: [] } };

describe('architecture tab state lifecycle', () => {
  beforeEach(() => useArchitectureStore.setState({ states: {} }));
  it('removes empty tab state after repeated snapshot switching', () => {
    for (let index = 0; index < 50; index++) { const id = `tab:${index}`; useArchitectureStore.getState().setSnapshot(id, snapshot); useArchitectureStore.getState().setSnapshot(id, undefined); }
    expect(Object.keys(useArchitectureStore.getState().states)).toHaveLength(0);
  });
});
