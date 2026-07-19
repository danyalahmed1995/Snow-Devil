import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitComparison } from '../../commit-graph/types';
import { useModeStore } from '../../stores/mode-store';
import { boundedPatchPreview, CommitComparisonPage, COMPARE_PATCH_PREVIEW_LINE_LIMIT, diffLineKind } from './CommitComparisonPage';

const { fetchComparison } = vi.hoisted(() => ({ fetchComparison: vi.fn() }));
vi.mock('../../commit-graph/data', () => ({ fetchComparison, demoComparison: vi.fn() }));

function largeComparison(): CommitComparison {
  return {
    baseSha: 'base', targetSha: 'target', status: 'ahead', aheadBy: 149, behindBy: 0, totalCommits: 149, additions: 30_000, deletions: 132,
    files: Array.from({ length: 300 }, (_, index) => ({ filename: `src/file-${index}.ts`, status: 'modified', additions: 10, deletions: 1, changes: 11, patch: `@@ file ${index} @@\n+content-${index}` })),
    commits: [],
  };
}

describe('CommitComparisonPage performance bounds', () => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'live' });
    fetchComparison.mockReset().mockResolvedValue(largeComparison());
  });

  it('mounts at most one patch while keeping all file headers available', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CommitComparisonPage repository="octo/app" baseSha="base" targetSha="target"/></QueryClientProvider>);
    expect(await screen.findByText('300')).toBeInTheDocument();
    expect(screen.getAllByTestId('compare-file-patch')).toHaveLength(1);
    expect(screen.getByTestId('compare-file-patch')).toHaveTextContent('content-0');
    expect(screen.getByText('+content-0')).toHaveClass('is-addition');
    fireEvent.click(screen.getByRole('button', { name: /src\/file-1\.ts/ }));
    await waitFor(() => expect(screen.getAllByTestId('compare-file-patch')).toHaveLength(1));
    expect(screen.getByTestId('compare-file-patch')).toHaveTextContent('content-1');
    expect(screen.queryByText('content-0')).not.toBeInTheDocument();
  });

  it('bounds pathological single-file patch previews', () => {
    const patch = Array.from({ length: COMPARE_PATCH_PREVIEW_LINE_LIMIT + 50 }, (_, index) => `line ${index}`).join('\n');
    const preview = boundedPatchPreview(patch);
    expect(preview.truncated).toBe(true);
    expect(preview.text.split('\n')).toHaveLength(COMPARE_PATCH_PREVIEW_LINE_LIMIT);
  });

  it('classifies unified diff lines without coloring file markers as changes', () => {
    expect(diffLineKind('+added')).toBe('addition');
    expect(diffLineKind('-removed')).toBe('removal');
    expect(diffLineKind('@@ -1 +1 @@')).toBe('hunk');
    expect(diffLineKind('+++ b/file.ts')).toBe('metadata');
    expect(diffLineKind('--- a/file.ts')).toBe('metadata');
    expect(diffLineKind(' unchanged')).toBe('context');
  });
});
