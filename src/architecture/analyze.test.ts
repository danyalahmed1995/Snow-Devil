import { describe, expect, it } from 'vitest';
import { analyzePullRequestArchitecture, stableComponentId } from './analyze';
import { buildRepositoryArchitectureSnapshot } from './repository-analyze';
import type { ArchitectureDiffFile } from './types';

function file(path: string, additions = 4, deletions = 1, lines: ArchitectureDiffFile['lines'] = []): ArchitectureDiffFile {
  return { oldPath: path, newPath: path, status: 'modified', additions, deletions, lines };
}

describe('Architecture Context deterministic PR analysis', () => {
  it('uses stable repository-qualified component IDs', () => {
    expect(stableComponentId('Acme/Console', 'src/components/workspace')).toBe('acme-console:src-components-workspace');
    expect(stableComponentId('Acme/Console', 'src/components/workspace')).toBe(stableComponentId('Acme/Console', 'src/components/workspace'));
  });

  it('selects the primary component by weighted change concentration', () => {
    const impact = analyzePullRequestArchitecture({ repositoryId: 'acme/console', pullRequestNumber: 42, generatedAt: '2026-07-10T00:00:00Z', files: [file('src/components/workspace/Workspace.tsx', 50), file('src/components/workspace/Tab.tsx', 20), file('src/stores/tabs-store.ts', 2)] });
    expect(impact.snapshot.status).toBe('partial');
    expect(impact.affectedComponents).toHaveLength(2);
    expect(impact.affectedComponents[0].component.name).toBe('Workspace');
    expect(impact.affectedComponents[0].role).toBe('primary');
    expect(impact.confidence.level).toBe('low');
  });

  it('keeps unmapped files and lowers confidence', () => {
    const impact = analyzePullRequestArchitecture({ repositoryId: 'acme/console', pullRequestNumber: 7, files: [file('src/app/App.tsx'), file('miscellaneous-note.xyz')] });
    expect(impact.unmappedFiles).toEqual(['miscellaneous-note.xyz']);
    expect(impact.changedFileMappings).toHaveLength(2);
    expect(impact.risk.reasons.map(reason => reason.code)).toContain('unmapped');
  });

  it('creates cross-component dependency changes only from exact patch imports', () => {
    const impact = analyzePullRequestArchitecture({ repositoryId: 'acme/console', pullRequestNumber: 9, files: [file('src/components/workspace/Workspace.tsx', 3, 0, [{ type: 'add', text: "import { useTabs } from '../../stores/tabs-store';" }])] });
    expect(impact.dependencyChanges).toHaveLength(1);
    expect(impact.dependencyChanges[0]).toMatchObject({ change: 'new', kind: 'import' });
    expect(impact.dependencyChanges[0].evidence[0].source).toBe('src/components/workspace/Workspace.tsx');
    expect(impact.directBlastRadius).toHaveLength(2);
  });

  it('adds explainable risk for persistence and security boundaries', () => {
    const impact = analyzePullRequestArchitecture({ repositoryId: 'acme/console', pullRequestNumber: 11, files: [file('src-tauri/src/db/migrations.rs'), file('src-tauri/src/auth/token.rs')] });
    expect(impact.risk.level).not.toBe('unknown');
    expect(impact.risk.score).toBeGreaterThan(0);
    expect(impact.risk.reasons.map(reason => reason.code)).toEqual(expect.arrayContaining(['persistence', 'security']));
    expect(impact.risk.reasons.every(reason => Boolean(reason.detail))).toBe(true);
  });

  it('maps a C/C++ PR against the repository snapshot and uses include edges for blast radius', () => {
    const snapshot = buildRepositoryArchitectureSnapshot({ repositoryId: 'facebook/zstd', baseCommitSha: 'base123', truncated: false, files: [{ path: 'CMakeLists.txt' }, { path: 'lib/common/zstd_internal.h' }, { path: 'tests/fuzzer.c' }], contents: { 'CMakeLists.txt': 'add_library(libzstd lib/common/zstd_internal.h)', 'tests/fuzzer.c': '#include "../lib/common/zstd_internal.h"' }, requestCount: 2, excludedPaths: [], warnings: [], stages: ['Ready'] });
    const impact = analyzePullRequestArchitecture({ repositoryId: 'facebook/zstd', pullRequestNumber: 4675, baseSha: 'base123', headSha: 'head456', snapshot, files: [file('tests/fuzzer.c', 13, 0, [{ type: 'add', text: '#include "../lib/common/zstd_internal.h"' }])] });
    expect(impact.affectedComponents[0].component.name).toBe('Test Suite');
    expect(impact.dependencyChanges[0]).toMatchObject({ kind: 'include', change: 'new' });
    expect(impact.snapshot.components.find(component => component.id === impact.dependencyChanges[0].toComponentId)?.name).toBe('Library Core');
    expect(impact.directBlastRadius.length).toBeGreaterThanOrEqual(2);
    expect(impact.confidence.level).toBe('medium');
  });
});
