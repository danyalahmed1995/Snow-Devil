import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CIWorkflowRun } from '../../ci/ci-watcher';
import { useCIWatcherStore } from '../../stores/ci-watcher-store';
import { CIWatcherPanel } from './CIWatcherPanel';

function run(index: number): CIWorkflowRun {
  return {
    id: `workflow-run:octo/app:${index}`,
    runId: index,
    repositoryId: 'octo/app',
    workflowName: `Workflow ${index}`,
    runNumber: index,
    status: 'completed',
    conclusion: index === 1 ? 'failure' : 'success',
    createdAt: `2026-06-${String(index).padStart(2, '0')}T00:00:00Z`,
    updatedAt: `2026-06-${String(index).padStart(2, '0')}T00:05:00Z`,
    runAttempt: 1,
    url: `https://github.com/octo/app/actions/runs/${index}`,
  };
}

beforeEach(() => useCIWatcherStore.setState({
  activeAccount: 'octo',
  runsByRepository: {},
  repositoryState: {},
  subscriptions: {},
}));

describe('CIWatcherPanel', () => {
  it('keeps the compact status strip to three rows until explicitly expanded', () => {
    useCIWatcherStore.setState({ runsByRepository: { 'octo/app': [1, 2, 3, 4, 5, 6].map(run) } });
    const view = render(<CIWatcherPanel compact />);
    expect(view.container.querySelectorAll('.ci-run')).toHaveLength(3);
    const expand = screen.getByRole('button', { name: 'View all 6' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(view.container.querySelectorAll('.ci-run')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not present unresolved first load as a valid zero-run result', () => {
    render(<CIWatcherPanel compact />);
    expect(screen.getByText('Preparing the first CI snapshot')).toBeInTheDocument();
    expect(screen.queryByText('No recent workflow runs')).not.toBeInTheDocument();
  });

  it('keeps a repository snapshot visible and labels refresh state', () => {
    useCIWatcherStore.setState({
      runsByRepository: { 'octo/app': [run(1)] },
      repositoryState: { 'octo/app': { status: 'refreshing', message: 'Refreshing workflow runs; the previous snapshot remains visible' } },
    });
    render(<CIWatcherPanel repositoryId="Octo/App" compact />);
    expect(screen.getByText('Workflow 1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('previous snapshot remains visible');
  });
});
