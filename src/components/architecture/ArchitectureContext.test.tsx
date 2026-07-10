import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePullRequestArchitecture } from '../../architecture/analyze';
import { ArchitectureContext } from './ArchitectureContext';

const impact = analyzePullRequestArchitecture({
  repositoryId: 'acme/console', pullRequestNumber: 42, generatedAt: '2026-07-10T00:00:00Z', files: [
    { oldPath: 'src/components/workspace/Workspace.tsx', newPath: 'src/components/workspace/Workspace.tsx', status: 'modified', additions: 12, deletions: 2, lines: [{ type: 'add', text: "import { useTabs } from '../../stores/tabs-store';" }] },
    { oldPath: 'scripts/release-note.xyz', newPath: 'scripts/release-note.xyz', status: 'modified', additions: 2, deletions: 0, lines: [] },
  ],
});

describe('ArchitectureContext', () => {
  beforeEach(() => localStorage.clear());
  it('renders summary, evidence, and preserves unmapped warnings', () => {
    render(<ArchitectureContext impact={impact} onSelectComponent={vi.fn()} onOpenFile={vi.fn()}/>);
    expect(screen.getByText('Architecture Impact')).toBeInTheDocument();
    expect(screen.getByText('Primary Component')).toBeInTheDocument();
    expect(screen.getByText(/unmapped file is preserved/i)).toBeInTheDocument();
    expect(screen.getByText(/partial repository snapshot/i)).toBeInTheDocument();
    expect(screen.getAllByText(/full repository index was unavailable/i)).toHaveLength(2);
  });

  it('switches to grouped files and opens a changed file', () => {
    const open = vi.fn();
    render(<ArchitectureContext impact={impact} onSelectComponent={vi.fn()} onOpenFile={open}/>);
    fireEvent.click(screen.getByRole('tab', { name: /Changed Files/i }));
    fireEvent.click(screen.getByText('src/components/workspace/Workspace.tsx'));
    expect(open).toHaveBeenCalledWith('src/components/workspace/Workspace.tsx');
  });

  it('shows dependency evidence only when the patch supports it', () => {
    render(<ArchitectureContext impact={impact} onSelectComponent={vi.fn()} onOpenFile={vi.fn()}/>);
    fireEvent.click(screen.getByRole('tab', { name: /Dependencies/i }));
    expect(screen.getByText(/Added import/)).toBeInTheDocument();
  });

  it('keeps the component glyph constrained inside the node instead of scaling it as the graph SVG', () => {
    const { container } = render(<ArchitectureContext impact={impact} onSelectComponent={vi.fn()} onOpenFile={vi.fn()}/>);
    const canvas = container.querySelector('.architecture-map__canvas');
    const graphSvgs = canvas?.querySelectorAll(':scope > svg');
    const nodeIcon = canvas?.querySelector('.architecture-node__icon > svg');
    expect(graphSvgs).toHaveLength(1);
    expect(nodeIcon).toHaveAttribute('width', '13');
    expect(nodeIcon).toHaveAttribute('height', '13');
  });
});
