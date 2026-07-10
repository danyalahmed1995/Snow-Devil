import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArchitectureSnapshot } from '../../architecture/types';
import { RepositoryArchitectureView } from './RepositoryArchitectureView';

const snapshot: ArchitectureSnapshot = { repositoryId: 'facebook/zstd', baseCommitSha: '5233c58e6ca0', generatedAt: '2026-07-10T00:00:00Z', algorithmVersion: 2, status: 'ready', components: [{ id: 'tests', repositoryId: 'facebook/zstd', name: 'Test Suite', kind: 'tests', rootPaths: ['tests'], manifestPaths: [], configured: false, owners: [{ login: '@zstd/test', source: 'CODEOWNERS' }], confidence: { level: 'medium', score: .82 } }, { id: 'lib', repositoryId: 'facebook/zstd', name: 'Library Core', kind: 'library', rootPaths: ['lib'], manifestPaths: ['CMakeLists.txt'], configured: false, owners: [], confidence: { level: 'high', score: .9 } }], dependencies: [{ fromComponentId: 'tests', toComponentId: 'lib', kind: 'include', confidence: { level: 'high', score: .9 }, evidence: [{ type: 'include', source: 'tests/fuzzer.c', detail: 'Local include resolves to lib/zstd.h.' }] }], files: [{ path: 'tests/fuzzer.c', componentId: 'tests', confidence: { level: 'medium', score: .82 }, reasons: [] }, { path: 'lib/zstd.h', componentId: 'lib', confidence: { level: 'high', score: .9 }, reasons: [] }], unmappedFiles: [], excludedPaths: [], warnings: [], evidenceSummary: { mappedFiles: 2, totalFiles: 2, configured: false, manifestCount: 1, dependencyEvidenceCount: 1, ownedFiles: 1, requestCount: 2, exclusions: [] } };

describe('RepositoryArchitectureView', () => {
  it('shows repository components, dependencies, ownership coverage, and refresh', () => {
    const refresh = vi.fn(); const select = vi.fn();
    render(<RepositoryArchitectureView snapshot={snapshot} loading={false} onRefresh={refresh} onSelect={select}/>);
    expect(screen.getByText('Component Index')).toBeInTheDocument();
    expect(screen.getAllByText('Test Suite').length).toBeGreaterThan(0);
    expect(screen.getByText('Mapping coverage')).toBeInTheDocument();
    expect(screen.getByText(/Test Suite → Library Core/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Refresh architecture/i }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
