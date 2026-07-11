import { beforeEach, describe, expect, it } from 'vitest';
import { useArchitectureStore } from './architecture-store';
import type { ArchitectureSnapshot } from './types';
import { analyzePullRequestArchitecture } from './analyze';

const snapshot: ArchitectureSnapshot = { repositoryId: 'acme/repo', baseCommitSha: 'abc', generatedAt: '2026-07-10T00:00:00Z', algorithmVersion: 2, status: 'ready', components: [], dependencies: [], files: [], unmappedFiles: [], excludedPaths: [], warnings: [], evidenceSummary: { mappedFiles: 0, totalFiles: 0, configured: false, manifestCount: 0, dependencyEvidenceCount: 0, ownedFiles: 0, requestCount: 0, exclusions: [] } };

describe('architecture tab state lifecycle', () => {
  beforeEach(() => useArchitectureStore.setState({ states: {} }));
  it('removes empty tab state after repeated snapshot switching', () => {
    for (let index = 0; index < 50; index++) { const id = `tab:${index}`; useArchitectureStore.getState().setSnapshot(id, snapshot); useArchitectureStore.getState().setSnapshot(id, undefined); }
    expect(Object.keys(useArchitectureStore.getState().states)).toHaveLength(0);
  });
  it('preserves the selected Architecture section when an impact is replaced', () => {
    const first = analyzePullRequestArchitecture({ repositoryId: 'acme/repo', pullRequestNumber: 42, headSha: 'first', files: [] });
    const next = analyzePullRequestArchitecture({ repositoryId: 'acme/repo', pullRequestNumber: 42, headSha: 'next', files: [] });
    useArchitectureStore.getState().setImpact('tab:pr', first);
    useArchitectureStore.getState().setSection('tab:pr', 'map');
    useArchitectureStore.getState().setImpact('tab:pr', next);
    expect(useArchitectureStore.getState().states['tab:pr']?.section).toBe('map');
  });
});
