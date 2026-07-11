import { describe, it, expect } from 'vitest';
import { computeLayout } from './ArchitectureGraphLayout';

describe('ArchitectureGraphLayout', () => {
  it('handles empty graphs', () => {
    const layout = computeLayout([], []);
    expect(layout.nodes.size).toBe(0);
    expect(layout.groups.size).toBe(0);
  });

  it('lays out a single node', () => {
    const layout = computeLayout([{ id: 'c1' }], [], 'c1');
    expect(layout.nodes.get('c1')).toBeDefined();
    expect(layout.nodes.get('c1')?.x).toBe(0);
    expect(layout.nodes.get('c1')?.y).toBe(0);
  });

  it('computes basic layer-based horizontal layout', () => {
    const nodes = [
      { id: 'c1' },
      { id: 'c2' },
      { id: 'c3' }
    ];
    const edges = [
      { source: 'c2', target: 'c1' }, // c2 depends on c1, so c2 is layer -1
      { source: 'c1', target: 'c3' }  // c3 depends on c1, so c3 is layer +1
    ];
    // Primary node c1 should be layer 0
    const layout = computeLayout(nodes, edges, 'c1');
    const l1 = layout.nodes.get('c3'); // layer -1 (left) (c3 is a dependency)
    const l2 = layout.nodes.get('c1'); // layer 0 (middle)
    const l3 = layout.nodes.get('c2'); // layer +1 (right) (c2 is a dependent)
    
    expect(l1).toBeDefined();
    expect(l2).toBeDefined();
    expect(l3).toBeDefined();
    expect(l1!.x).toBeLessThan(l2!.x);
    expect(l2!.x).toBeLessThan(l3!.x);
  });
  
  it('groups nodes inside containers', () => {
    const nodes = [
      { id: 'c1', groupId: 'g1' },
      { id: 'c2', groupId: 'g1' },
      { id: 'c3', groupId: 'g2' }
    ];
    const edges = [
      { source: 'c1', target: 'c3' } // g1 depends on g2, so g2 layer 1, g1 layer 0 (if c1 is primary)
    ];
    const layout = computeLayout(nodes, edges, 'c1');
    
    const g1Box = layout.groups.get('g1');
    const g2Box = layout.groups.get('g2');
    expect(g1Box).toBeDefined();
    expect(g2Box).toBeDefined();
    
    // c1 and c2 should be inside g1
    const n1 = layout.nodes.get('c1')!;
    const n2 = layout.nodes.get('c2')!;
    
    expect(n1.x).toBeGreaterThanOrEqual(g1Box!.x);
    expect(n1.y).toBeGreaterThanOrEqual(g1Box!.y);
    expect(n2.x).toBeGreaterThanOrEqual(g1Box!.x);
    expect(n2.y).toBeGreaterThanOrEqual(g1Box!.y);
  });
});
