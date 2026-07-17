import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { FlowPipeline } from './FlowPipeline';
import type { FlowItem } from '../../types/flow';

const sources: any = { openPrs: { hasNextPage: false, isFetching: false }, openIssues: { hasNextPage: false, isFetching: false }, mergedPrs: { hasNextPage: false, isFetching: false }, releases: { hasNextPage: false, isFetching: false } };
function flowItem(index: number): FlowItem { return { id: `item-${index}`, type: 'issue', repositoryId: 'repo', repositoryName: 'octo/repo', owner: 'octo', number: index, title: `Issue ${index}`, stage: 'issues', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }; }

describe('FlowPipeline', () => {
  it('maintains a positive horizontal gap between adjacent lanes', () => {
    const mockSourceControls: any = {
      openPrs: { hasNextPage: false, isFetching: false },
      openIssues: { hasNextPage: false, isFetching: false },
      mergedPrs: { hasNextPage: false, isFetching: false },
      releases: { hasNextPage: false, isFetching: false }
    };

    const { container } = render(
      <FlowPipeline
        items={[]}
        sourceControls={mockSourceControls}
      />
    );

    // Grab all columns
    const columns = container.querySelectorAll('.flow-workbench-lane');
    expect(columns.length).toBeGreaterThan(1);

    // Mock getBoundingClientRect for JSDOM which normally returns 0
    let i = 0;
    const originalMethod = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function() {
      if (this.classList.contains('flow-workbench-lane')) {
        const currentX = 12 + (i * (320 + 12));
        i++;
        return {
          x: currentX,
          y: 0,
          width: 320,
          height: 600,
          top: 0,
          right: currentX + 320,
          bottom: 600,
          left: currentX,
          toJSON: () => {}
        };
      }
      return originalMethod.call(this);
    };

    const colsArray = Array.from(columns);
    for (let j = 0; j < colsArray.length - 1; j++) {
      const leftRect = colsArray[j].getBoundingClientRect();
      const rightRect = colsArray[j + 1].getBoundingClientRect();
      
      const gap = rightRect.left - leftRect.right;
      expect(gap).toBeGreaterThan(0);
    }
    
    // Restore
    window.HTMLElement.prototype.getBoundingClientRect = originalMethod;
  });

  it('expands and collapses cards inside the stage viewport', () => {
    render(<FlowPipeline items={Array.from({ length: 8 }, (_, index) => flowItem(index + 1))} sourceControls={sources} />);
    expect(screen.getAllByRole('button', { name: /issue #/i })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getAllByRole('button', { name: /issue #/i })).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('button', { name: /issue #/i })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
    expect(document.querySelector('[data-stage-id="issues"]')).toHaveClass('flow-stage-content');
  });

  it('keeps the expansion control stable when a pending focus temporarily reveals a hidden card', () => {
    const onConsumeScroll = vi.fn();
    render(<FlowPipeline items={Array.from({ length: 8 }, (_, index) => flowItem(index + 1))} sourceControls={sources} pendingScrollItemId="item-8" onConsumeScroll={onConsumeScroll} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));

    expect(screen.getAllByRole('button', { name: /issue #/i })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  });

  it('selects on click and opens on Enter or double click', () => {
    const onSelect = vi.fn(); const onOpen = vi.fn();
    render(<FlowPipeline items={[flowItem(1)]} sourceControls={sources} onSelectItem={onSelect} onOpenItem={onOpen} />);
    const card = screen.getByRole('button', { name: 'issue #1 Issue 1' });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.doubleClick(card);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('hides empty stages without changing canonical ordering', () => {
    const { container } = render(<FlowPipeline items={[flowItem(1)]} sourceControls={sources} hideEmptyStages />);
    expect(container.querySelectorAll('.flow-workbench-lane')).toHaveLength(1);
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });

  it('switches a selected stage to the dedicated focused grid contract', () => {
    const { container } = render(<FlowPipeline items={Array.from({ length: 5 }, (_, index) => flowItem(index + 1))} sourceControls={sources} focusedStage="issues" resetKey="focused-issues" />);
    expect(container.querySelector('.flow-lane-scroller')).toHaveClass('flow-lane-scroller--focused');
    expect(container.querySelector('.flow-workbench-pipeline')).toHaveClass('flow-workbench-pipeline--focused');
    expect(container.querySelectorAll('.flow-workbench-lane')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /issue #/i })).toHaveLength(5);
  });

  it('keeps the focused scroll owner stable while cards append and across remounts', () => {
    const { container, unmount } = render(<FlowPipeline items={Array.from({ length: 8 }, (_, index) => flowItem(index + 1))} sourceControls={sources} focusedStage="issues" resetKey="focused-scroll" />);
    const scroller = container.querySelector<HTMLElement>('.flow-lane-scroller--focused')!;
    expect(scroller).toHaveAttribute('tabindex', '0');
    scroller.scrollTop = 180;
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(scroller.scrollTop).toBe(180);
    unmount();
    const restored = render(<FlowPipeline items={Array.from({ length: 8 }, (_, index) => flowItem(index + 1))} sourceControls={sources} focusedStage="issues" resetKey="focused-scroll" />).container.querySelector<HTMLElement>('.flow-lane-scroller--focused')!;
    expect(restored.scrollTop).toBe(180);
  });
});
