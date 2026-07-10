import { describe, expect, it } from 'vitest';
import { buildRepositoryArchitectureSnapshot } from './repository-analyze';
import type { RepositoryArchitectureInput } from './types';

function input(update: Partial<RepositoryArchitectureInput> = {}): RepositoryArchitectureInput {
  return { repositoryId: 'acme/project', baseCommitSha: 'abc123', truncated: false, files: [], contents: {}, requestCount: 2, excludedPaths: [], warnings: [], stages: ['Ready'], ...update };
}

describe('repository architecture snapshot', () => {
  it('discovers CMake production and test components and resolves local includes', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({
      files: ['CMakeLists.txt', 'lib/common/zstd_internal.h', 'lib/common/error_private.h', 'tests/fuzzer.c'].map(path => ({ path })),
      contents: {
        'CMakeLists.txt': 'add_library(libzstd lib/common/error_private.h)\nadd_executable(fuzzer tests/fuzzer.c)',
        'tests/fuzzer.c': '#include <stdio.h>\n#include "../lib/common/zstd_internal.h"',
        'lib/common/zstd_internal.h': '#include "error_private.h"',
      },
    }), '2026-07-10T00:00:00Z');
    expect(snapshot.status).toBe('ready');
    expect(snapshot.components.map(component => component.name)).toEqual(expect.arrayContaining(['Library Core', 'Test Suite']));
    const edge = snapshot.dependencies.find(dependency => dependency.kind === 'include');
    expect(edge).toBeDefined();
    expect(edge?.evidence[0].detail).toContain('zstd_internal.h');
    expect(snapshot.dependencies.some(dependency => dependency.evidence.some(evidence => evidence.detail.includes('stdio')))).toBe(false);
  });

  it('uses the last matching CODEOWNERS rule and exposes owners on components', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({
      files: [{ path: 'package.json' }, { path: 'src/components/workspace/App.tsx' }, { path: '.github/CODEOWNERS' }],
      contents: { 'package.json': '{}', '.github/CODEOWNERS': '* @fallback\nsrc/** @frontend\nsrc/components/workspace/** @workspace' },
    }));
    const workspace = snapshot.components.find(component => component.rootPaths.includes('src/components/workspace'));
    expect(workspace?.owners.map(owner => owner.login)).toEqual(['@workspace']);
    expect(snapshot.evidenceSummary.ownedFiles).toBeGreaterThan(0);
  });

  it('lets valid explicit configuration override inferred boundaries', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({
      files: [{ path: '.snowdevil/architecture.yml' }, { path: 'src/stores/tabs-store.ts' }, { path: 'src/browser/runtime.ts' }],
      config: { version: 1, components: [{ id: 'navigation', name: 'Workspace Navigation', kind: 'application', paths: ['src/stores/tabs-store.ts', 'src/browser/**'] }], dependencies: [] },
      configHash: 'cfg1',
    }));
    expect(snapshot.components).toHaveLength(1);
    expect(snapshot.components[0]).toMatchObject({ name: 'Workspace Navigation', configured: true });
    expect(snapshot.files.find(file => file.path === 'src/browser/runtime.ts')?.reasons[0].type).toBe('configured-path');
  });

  it('reports actionable invalid configuration and partial state', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({ files: [{ path: 'src/main.ts' }], config: { version: 2, components: [{ id: 'broken' }] } }));
    expect(snapshot.status).toBe('partial');
    expect(snapshot.warnings.map(warning => warning.code)).toContain('invalid-config');
    expect(snapshot.warnings.map(warning => warning.message).join(' ')).toContain('version: 1');
  });

  it('discovers supported project manifests without forcing unknown files', () => {
    const paths = ['apps/web/package.json', 'crates/engine/Cargo.toml', 'services/api/api.csproj', 'python/pyproject.toml', 'go/go.mod', 'java/pom.xml', 'cpp/meson.build', 'bazel/BUILD.bazel', 'notes.loose'];
    const snapshot = buildRepositoryArchitectureSnapshot(input({ files: paths.map(path => ({ path })) }));
    expect(snapshot.components.map(component => component.rootPaths[0])).toEqual(expect.arrayContaining(['apps/web', 'crates/engine', 'services/api', 'python', 'go', 'java', 'cpp', 'bazel']));
    expect(snapshot.unmappedFiles).toContain('notes.loose');
    expect(snapshot.evidenceSummary.manifestCount).toBeGreaterThanOrEqual(8);
  });

  it('creates workspace manifest dependencies for JavaScript and Rust packages', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({
      files: ['packages/ui/package.json', 'packages/core/package.json', 'crates/cli/Cargo.toml', 'crates/engine/Cargo.toml'].map(path => ({ path })),
      contents: {
        'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', dependencies: { '@acme/core': 'workspace:*' } }),
        'packages/core/package.json': JSON.stringify({ name: '@acme/core' }),
        'crates/cli/Cargo.toml': '[dependencies]\nengine = { path = "../engine" }',
        'crates/engine/Cargo.toml': '[package]\nname="engine"',
      },
    }));
    expect(snapshot.dependencies.filter(edge => edge.kind === 'manifest')).toHaveLength(2);
    expect(snapshot.dependencies.flatMap(edge => edge.evidence.map(evidence => evidence.detail))).toEqual(expect.arrayContaining([expect.stringContaining('@acme/core'), expect.stringContaining('Cargo path dependency')]));
  });

  it('preserves precise partial reasons for truncated trees and content caps', () => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({ truncated: true, files: [{ path: 'CMakeLists.txt' }, { path: 'lib/core.c' }], warnings: ['GitHub returned a truncated recursive tree; the snapshot is incomplete.', 'Dependency enrichment was capped at 360 source and structural files.'] }));
    expect(snapshot.status).toBe('partial');
    expect(snapshot.warnings.map(warning => warning.code)).toEqual(expect.arrayContaining(['truncated-tree', 'content-cap']));
  });

  it.each(['Makefile', 'meson.build', 'BUILD', 'BUILD.bazel'])('uses %s as C/C++ build-boundary evidence', manifest => {
    const snapshot = buildRepositoryArchitectureSnapshot(input({ files: [{ path: manifest }, { path: 'lib/core.c' }, { path: 'tests/core_test.c' }], contents: { [manifest]: 'build target' } }));
    expect(snapshot.components.map(component => component.name)).toEqual(expect.arrayContaining(['Library Core', 'Test Suite']));
    expect(snapshot.files.find(file => file.path === 'lib/core.c')?.reasons[0].type).toBe('build-target');
  });
});
