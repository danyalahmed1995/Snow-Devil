import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModeStore } from '../../stores/mode-store';
import { useExplorerStore } from '../../stores/explorer-store';
import { useTabsStore } from '../../stores/tabs-store';
import { RepositoryExplorer } from './RepositoryExplorer';

const now = Date.now();

describe('RepositoryExplorer tree presentation', () => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'demo', demoRevision: 0 });
    useExplorerStore.setState({ states: {} });
    vi.mocked(invoke).mockClear();
    useTabsStore.setState({ tabs: [{ id: 'native:repo:octo/repo', family: 'native', kind: 'repositoryExplorer', title: 'repo', pinned: false, closable: true, createdAt: now, lastActivatedAt: now, context: { type: 'repository', repository: 'octo/repo' } }], activeTabId: 'native:repo:octo/repo' });
  });

  it('renders a TREE label and distinct repository root row', async () => {
    render(<RepositoryExplorer repository="octo/repo" />);
    expect(screen.getByText('TREE')).toBeInTheDocument();
    const root = screen.getByRole('treeitem', { name: /octo\/repo/ });
    expect(root).toHaveClass('repo-tree__root');
    expect(root).toHaveAttribute('data-tree-root', 'true');
    await expect(screen.findByText('src')).resolves.toBeInTheDocument();
  });

  it('expands folders with stable icons and preserves matching ancestors in local filter', async () => {
    render(<RepositoryExplorer repository="octo/repo" />);
    const src = await screen.findByRole('treeitem', { name: /Folder src/ });
    expect(src.querySelector('[data-tree-icon="folder-source"]')).toBeInTheDocument();
    fireEvent.click(src);
    await waitFor(() => expect(screen.getByRole('treeitem', { name: /File src\/main\.tsx/ })).toBeInTheDocument());
    expect(screen.getByRole('treeitem', { name: /File src\/main\.tsx/ }).querySelector('[data-tree-icon="file-typescript"]')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter loaded tree' }), { target: { value: 'App.tsx' } });
    expect(screen.getByRole('treeitem', { name: 'Folder src' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Folder src/app' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /File src\/app\/App\.tsx/ })).toBeInTheDocument();
  });

  it('centers the large-file guard inside the preview content area', async () => {
    render(<RepositoryExplorer repository="octo/repo" initialPath="Benchmark Files/heavy_mdx_5mb_examples/01-large-doc.mdx" />);
    const guard = await screen.findByText('Large file preview limited');
    const state = guard.closest('.repo-state');
    expect(state).toHaveClass('repo-state--guard');
    expect(state?.parentElement).toHaveClass('file-preview__content');
    expect(within(state as HTMLElement).getByRole('button', { name: 'Open on GitHub' })).toBeInTheDocument();

    fireEvent.resize(window);
    expect(screen.getByText('Large file preview limited').closest('.repo-state')?.parentElement).toHaveClass('file-preview__content');
  });

  it('clicking parent directory breadcrumbs clears file preview without crashing', async () => {
    render(<RepositoryExplorer repository="octo/repo" initialPath="Benchmark Files/heavy_mdx_5mb_examples/01-large-doc.mdx" />);
    await screen.findByText('Large file preview limited');

    fireEvent.click(screen.getByRole('button', { name: 'heavy_mdx_5mb_examples' }));

    expect(await screen.findByText('Directory selected')).toBeInTheDocument();
    expect(screen.getByText('Choose a file from the tree to preview it.')).toBeInTheDocument();
    expect(screen.queryByText('Large file preview limited')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Folder Benchmark Files/heavy_mdx_5mb_examples' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('clicking the repository root breadcrumb returns to a safe root empty state', async () => {
    render(<RepositoryExplorer repository="octo/repo" initialPath="Benchmark Files/heavy_mdx_5mb_examples/01-large-doc.mdx" />);
    await screen.findByText('Large file preview limited');
    const breadcrumb = screen.getByRole('navigation', { name: 'File breadcrumb' });

    fireEvent.click(within(breadcrumb).getByRole('button', { name: 'repo' }));

    expect(await screen.findByText('Repository root selected')).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /octo\/repo/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Large file preview limited')).not.toBeInTheDocument();
  });

  it('rapid breadcrumb clicks keep the latest directory selection', async () => {
    render(<RepositoryExplorer repository="octo/repo" initialPath="Benchmark Files/heavy_mdx_5mb_examples/01-large-doc.mdx" />);
    await screen.findByText('Large file preview limited');

    fireEvent.click(screen.getByRole('button', { name: 'heavy_mdx_5mb_examples' }));
    fireEvent.click(screen.getByRole('button', { name: 'Benchmark Files' }));

    expect(await screen.findByText('Directory selected')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Folder Benchmark Files' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('normalizes encoded spaces, punctuation, and unicode breadcrumb paths', async () => {
    render(<RepositoryExplorer repository="octo/repo" initialPath="Benchmark%20Files/url-sensitive/100%25%20ready%20%231%3F.md" />);
    expect(await screen.findByText('100% ready #1?.md')).toBeInTheDocument();
    expect(await screen.findByText('Punctuation path')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'url-sensitive' }));
    expect(await screen.findByText('Directory selected')).toBeInTheDocument();

    cleanup();
    useModeStore.setState({ mode: 'demo', demoRevision: 0 });
    useExplorerStore.setState({ states: {} });
    render(<RepositoryExplorer repository="octo/repo" initialPath="Unicode/%E9%9B%AA.md" />);
    expect(await screen.findByText('雪.md')).toBeInTheDocument();
    expect(await screen.findByText('Unicode path')).toBeInTheDocument();
  });

  it('does not crash when restored explorer state contains a malformed selected path', async () => {
    useExplorerStore.setState({ states: { 'octo/repo@main': { expanded: [], selectedPath: 42 as unknown as string, search: '', scrollTop: 0, imageMode: 'fit', zoom: 1 } } });
    render(<RepositoryExplorer repository="octo/repo" />);
    expect(await screen.findByText('Repository root selected')).toBeInTheDocument();
    expect(screen.getByText('Choose a file from the tree to preview it.')).toBeInTheDocument();
  });

  it('normalizes live file payloads that omit byteSize', async () => {
    useModeStore.setState({ mode: 'live', demoRevision: 0 });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'execute_graphql') return { data: { repository: { defaultBranchRef: { name: 'main' }, refs: { nodes: [{ name: 'main' }] } } } };
      if (cmd === 'get_repo_tree') return { entries: [{ name: 'artifact.bin', path: 'artifact.bin', type: 'blob' }] };
      if (cmd === 'get_repo_file_content') return { path: 'artifact.bin', text: null };
      return null;
    });

    render(<RepositoryExplorer repository="octo/repo" initialPath="artifact.bin" />);

    expect(await screen.findByText('Unsupported binary file')).toBeInTheDocument();
    expect(screen.getByText(/Plain text · 0 bytes/)).toBeInTheDocument();
  });
});
