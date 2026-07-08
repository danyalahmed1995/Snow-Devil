import { useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CIRunRow } from './CIRunRow';
import type { SimulatorEvent } from '../../simulator/simulator-types';

vi.mock('../../hooks/useWorkflowJobs', () => ({
  useWorkflowJobs: () => ({ data: undefined, isLoading: false, error: null }),
}));

function run(id: string): SimulatorEvent {
  return {
    id,
    source: 'github',
    occurredAt: '2026-07-01T00:00:00.000Z',
    repositoryId: 'octo/widgets',
    repositoryName: 'widgets',
    repositoryOwner: 'octo',
    subjectId: id,
    subjectType: 'workflow_run',
    subjectTitle: `CI ${id}`,
    eventType: 'workflow_succeeded',
    sourceCompleteness: 'complete',
    metadata: {
      runId: id,
      runNumber: Number(id.replace(/\D/g, '')) || 1,
      status: 'completed',
      conclusion: 'success',
      headBranch: 'main',
      headSha: 'abc1234',
      durationMs: 1000,
      actorName: 'octocat',
    },
  };
}

const runs = [run('run-1'), run('run-2'), run('run-3')];

function ProbeList() {
  const [selectedId, setSelectedId] = useState('run-1');
  const [syncTick, setSyncTick] = useState(0);
  const select = useCallback((id: string) => setSelectedId(id), []);
  const openRun = useCallback(() => undefined, []);
  const openJob = useCallback(() => undefined, []);
  return (
    <div>
      <output aria-label="sync tick">{syncTick}</output>
      <button type="button" onClick={() => setSyncTick(value => value + 1)}>sync progress</button>
      {runs.map(item => (
        <CIRunRow
          key={item.id}
          run={item}
          isSelected={selectedId === item.id}
          onSelect={select}
          onOpenRun={openRun}
          onOpenJob={openJob}
        />
      ))}
    </div>
  );
}

describe('CIRunRow render stability', () => {
  beforeEach(() => {
    (window as any).__SNOW_DEVIL_CI_ROW_RENDER_PROBE__ = vi.fn();
  });

  it('does not rerender unrelated rows for sync progress or selection changes', async () => {
    const counts = new Map<string, number>();
    (window as any).__SNOW_DEVIL_CI_ROW_RENDER_PROBE__ = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);

    render(<ProbeList />);
    expect(Object.fromEntries(counts)).toEqual({ 'run-1': 1, 'run-2': 1, 'run-3': 1 });

    fireEvent.click(screen.getByRole('button', { name: 'sync progress' }));
    expect(Object.fromEntries(counts)).toEqual({ 'run-1': 1, 'run-2': 1, 'run-3': 1 });

    fireEvent.click(screen.getByText('CI run-2'));
    expect(counts.get('run-1')).toBe(2);
    expect(counts.get('run-2')).toBe(2);
    expect(counts.get('run-3')).toBe(1);
  });
});
