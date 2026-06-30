import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SimulatorEntityState } from '../../../simulator/simulator-types';
import { SimulatorEntityList } from './SimulatorEntityList';

function entity(index: number): SimulatorEntityState {
  return {
    id: `issue:octo/app:${index}`,
    repositoryId: 'octo/app',
    subjectType: 'issue',
    number: index,
    title: `Issue ${index}`,
    stage: 'coding',
    status: 'open',
    updatedAt: '2026-06-01T00:00:00Z',
    checkState: 'unknown',
    reviewState: 'none',
    commitCount: 0,
    commentCount: 0,
    sourceCompleteness: 'complete',
  } as SimulatorEntityState;
}

describe('SimulatorEntityList reveal loading', () => {
  it('mounts a canonical reveal target that starts behind the incremental limit', async () => {
    const entities = Array.from({ length: 70 }, (_, index) => entity(index + 1));
    const scrollRef = createRef<HTMLDivElement>();
    render(<SimulatorEntityList entities={entities} selectedId={entities[59].id} onSelect={vi.fn()} title="Active on selected date" query="" onQueryChange={vi.fn()} scrollRef={scrollRef} revealId={entities[59].id} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /#60 Issue 60/i })).toBeInTheDocument());
    expect(scrollRef.current?.querySelector(`[data-entity-id="${entities[59].id}"]`)).not.toBeNull();
    expect(scrollRef.current?.querySelector('.history-reveal-spacer')).toBeNull();
  });

  it('registers repository-qualified row keys and removes them on unmount', () => {
    const registerRow = vi.fn();
    const snow = entity(2);
    const ext = { ...entity(2), id: 'issue:octo/ext:2', repositoryId: 'octo/ext', title: 'EXT issue 2' };
    const view = render(<SimulatorEntityList entities={[snow, ext]} onSelect={vi.fn()} title="Active on selected date" query="" onQueryChange={vi.fn()} registerRow={registerRow}/>);
    expect(view.container.querySelector('[data-history-target-key="issue:octo/app:2"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-history-target-key="issue:octo/ext:2"]')).toBeInTheDocument();
    expect(registerRow).toHaveBeenCalledWith('issue:octo/app:2', expect.any(HTMLButtonElement));
    view.unmount();
    expect(registerRow).toHaveBeenCalledWith('issue:octo/app:2', null);
  });
});
