import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SimulatorEntityState } from '../../../simulator/simulator-types';
import { SIMULATOR_STAGE_PREVIEW_LIMIT, SimulatorStageColumn } from './SimulatorStageColumn';

function entity(index: number): SimulatorEntityState {
  return { id: `entity-${index}`, repositoryId: 'octo/repo', subjectType: 'pull_request', title: `Pull request ${index}`, number: index, stage: 'merged', status: 'merged', assignees: [], reviewers: [], labels: [], commitCount: 1, commentCount: 0, reviewCommentCount: 0, reviewState: 'approved', checkState: 'success', createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-${String(index).padStart(2, '0')}T00:00:00Z` };
}

describe('SimulatorStageColumn overflow', () => {
  it('shows the preview limit, then reveals every remaining card without duplicates', () => {
    const entities = Array.from({ length: 7 }, (_, index) => entity(index + 1));
    const onSelect = vi.fn();
    const onExpand = vi.fn();
    const view = render(<SimulatorStageColumn stage="merged" entities={entities} expanded={false} selectedEntityId="entity-2" onExpand={onExpand} onSelect={onSelect} />);
    expect(screen.getAllByRole('button', { name: /Pull request/ })).toHaveLength(SIMULATOR_STAGE_PREVIEW_LIMIT);
    const more = screen.getByRole('button', { name: 'Show 3 more Merged' });
    expect(more.tagName).toBe('BUTTON');
    expect(more).toHaveTextContent('+3 more');
    fireEvent.click(more);
    expect(onExpand).toHaveBeenCalledOnce();

    view.rerender(<SimulatorStageColumn stage="merged" entities={entities} expanded selectedEntityId="entity-2" onExpand={onExpand} onSelect={onSelect} />);
    const cards = screen.getAllByRole('button', { name: /Pull request/ });
    expect(cards).toHaveLength(7);
    expect(new Set(cards.map(card => card.textContent)).size).toBe(7);
    expect(screen.getByRole('button', { name: /Pull request 2/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Pull request 7/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'entity-7' }));
    expect(screen.getByTestId('simulator-stage-viewport-merged')).toHaveClass('is-expanded');
    const fewer = screen.getByRole('button', { name: 'Show fewer Merged' });
    expect(fewer).toHaveTextContent('Show fewer');
    fireEvent.click(fewer);
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it('keeps expansion inside a focusable scrolling viewport', () => {
    render(<SimulatorStageColumn stage="merged" entities={Array.from({ length: 8 }, (_, index) => entity(index + 1))} expanded selectedEntityId="entity-8" onExpand={vi.fn()} onSelect={vi.fn()} />);
    const viewport = screen.getByTestId('simulator-stage-viewport-merged');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('is-expanded');
    expect(screen.getAllByRole('button', { name: /Pull request/ })).toHaveLength(8);
  });
});
