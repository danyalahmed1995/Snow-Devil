import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FlowPipeline } from './FlowPipeline';

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
});
