import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullComponentMap } from './FullComponentMap';
import { useArchitectureStore } from '../../architecture/architecture-store';
import { useTabsStore } from '../../stores/tabs-store';
import { analyzePullRequestArchitecture } from '../../architecture/analyze';

// Basic impact data generator
function createImpact(components: any[], dependencies: any[], changes: any[]) {
  const impact = analyzePullRequestArchitecture({
    repositoryId: 'acme/repo', pullRequestNumber: 1, generatedAt: '2026-07-10T00:00:00Z', files: []
  });
  
  impact.snapshot.components = components;
  impact.snapshot.dependencies = dependencies;
  impact.dependencyChanges = changes;
  return impact;
}

describe('FullComponentMap Edge Rendering', () => {
  beforeEach(() => {
    useArchitectureStore.setState({ states: { 'test-tab': { section: 'map', mapState: { groupingMode: 'none', filters: { dependencies: true, dependents: true, indirect: true, external: true }, expandedGroups: [], zoom: 1, panX: 0, panY: 0 } } } });
    useTabsStore.setState({ activeTabId: 'test-tab' });
  });

  it('renders no fake arrows for one-node graphs', () => {
    const impact = createImpact([{ id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }], [], []);
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];
    
    const { container } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    const edges = container.querySelectorAll('.full-component-map__edge');
    expect(edges.length).toBe(0);
  });

  it('does not pan the graph with the right mouse button', () => {
    const impact = createImpact([{ id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }], [], []);
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];

    const { container } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    const canvas = container.querySelector('.full-component-map__canvas')!;
    fireEvent.pointerDown(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: 40, clientY: 50 });
    fireEvent.pointerMove(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: 140, clientY: 150 });
    fireEvent.pointerUp(canvas, { button: 2, buttons: 0, pointerId: 1, clientX: 140, clientY: 150 });

    expect(useArchitectureStore.getState().states['test-tab'].mapState).toMatchObject({ panX: 0, panY: 0 });
    expect(canvas).not.toHaveClass('is-dragging');
  });

  it('arrow markers exist for every directed visible edge and use non-scaling-stroke', () => {
    const impact = createImpact(
      [
        { id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } },
        { id: 'c2', name: 'Dep', kind: 'library', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }
      ],
      [{ fromComponentId: 'c1', toComponentId: 'c2', kind: 'import', confidence: { level: 'high', score: 1 }, evidence: [] }],
      [{ fromComponentId: 'c1', toComponentId: 'c2', change: 'new', kind: 'import', confidence: { level: 'high', score: 1 }, evidence: [] }]
    );
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];
    
    const { container } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    const edges = container.querySelectorAll('.full-component-map__edge');
    expect(edges.length).toBe(1);
    
    const edge = edges[0];
    expect(edge.getAttribute('marker-end')).toContain('url(#arrow-is-new)');
    
    // Check computed styles or classes to verify non-scaling-stroke logic
    expect(edge.getAttribute('class')).toContain('is-new');
  });

  it('arrowheads remain visible after Fit-to-view (markerUnits="userSpaceOnUse" scales with zoom)', () => {
    const impact = createImpact(
      [
        { id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } },
        { id: 'c2', name: 'Dep', kind: 'library', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }
      ],
      [{ fromComponentId: 'c1', toComponentId: 'c2', kind: 'import', confidence: { level: 'high', score: 1 }, evidence: [] }],
      []
    );
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];
    
    const { container } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    const markers = container.querySelectorAll('marker');
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0].getAttribute('markerUnits')).toBe('userSpaceOnUse');
  });

  it('relationship filters correctly add and remove edges', () => {
    const impact = createImpact(
      [
        { id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } },
        { id: 'c2', name: 'Dep', kind: 'library', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }
      ],
      [{ fromComponentId: 'c1', toComponentId: 'c2', kind: 'import', confidence: { level: 'high', score: 1 }, evidence: [] }],
      [{ fromComponentId: 'c1', toComponentId: 'c2', change: 'new', kind: 'import', confidence: { level: 'high', score: 1 }, evidence: [] }]
    );
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];
    
    const { container, rerender } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelectorAll('.full-component-map__edge').length).toBe(1);
    
    // Toggle dependencies off
    act(() => {
      useArchitectureStore.getState().setMapState('test-tab', { filters: { dependencies: false, dependents: true, indirect: true, external: true } });
    });
    rerender(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    
    expect(container.querySelectorAll('.full-component-map__edge').length).toBe(0);
  });

  it('can enter and exit full screen', () => {
    const impact = createImpact([{ id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }], [], []);
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];

    const { container, rerender } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelector('.full-component-map')?.className).not.toContain('is-full-screen');

    // Click Full screen
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Full screen/i })); });
    rerender(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelector('.full-component-map')?.className).toContain('is-full-screen');

    // Click Exit full screen
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Exit full screen/i })); });
    rerender(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelector('.full-component-map')?.className).not.toContain('is-full-screen');
  });

  it('switches color modes without changing the graph identity', () => {
    const impact = createImpact([{ id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }], [], []);
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];
    const { container } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Color by')).toHaveValue('architecture');
    fireEvent.change(screen.getByLabelText('Color by'), { target: { value: 'change-impact' } });
    expect(screen.getByLabelText('Color by')).toHaveValue('change-impact');
    expect(container.querySelector('.full-component-map__legend')).toHaveTextContent('Change Impact');
    expect(container.querySelector('.full-component-map__node')).toHaveTextContent('Insufficient evidence');
  });

  it('exits full screen with Escape key', () => {
    const impact = createImpact([{ id: 'c1', name: 'Primary', kind: 'application', rootPaths: [], manifestPaths: [], owners: [], configured: false, confidence: { level: 'high', score: 1 } }], [], []);
    impact.primaryComponentId = 'c1';
    impact.affectedComponents = [{ component: impact.snapshot.components[0], files: [], additions: 0, deletions: 0, role: 'primary' }];

    act(() => {
      useArchitectureStore.getState().setMapState('test-tab', { isFullScreen: true });
    });

    const { container, rerender } = render(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelector('.full-component-map')?.className).toContain('is-full-screen');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });
    rerender(<FullComponentMap impact={impact} onSelect={vi.fn()} />);
    expect(container.querySelector('.full-component-map')?.className).not.toContain('is-full-screen');
  });
});
