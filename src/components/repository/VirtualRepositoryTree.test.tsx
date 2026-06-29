import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { repositoryTreeWindow,VirtualRepositoryTree } from './VirtualRepositoryTree';

describe('repository tree windowing',()=>{
  it('renders small trees whole and bounds very large trees',()=>{expect(repositoryTreeWindow(100,0,400)).toEqual({start:0,end:100,virtual:false});const start=performance.now();const windowed=repositoryTreeWindow(100_000,1_400_000,800);const elapsed=performance.now()-start;expect(windowed.virtual).toBe(true);expect(windowed.end-windowed.start).toBeLessThan(60);expect(elapsed).toBeLessThan(10)});
  it('keeps overscan around the viewport boundaries',()=>{const top=repositoryTreeWindow(1000,0,400);expect(top.start).toBe(0);expect(top.end).toBeGreaterThan(14);const bottom=repositoryTreeWindow(1000,28_000,400);expect(bottom.end).toBe(1000)});
});

describe('virtual repository tree DOM budget',()=>{
  it('mounts only the visible window for a large expanded tree',()=>{
    const rows=Array.from({length:36_519},(_,index)=>({name:`file-${index}.ts`,path:`src/deep ${index}/日本語+file-${index}.ts`,type:'blob' as const,depth:2}));
    render(<VirtualRepositoryTree repository="kubernetes/kubernetes" rows={rows} expanded={new Set()} selectedPath="" selectedRoot={false} focusedPath="" query="" initialScrollTop={0} onRoot={vi.fn()} onOpen={vi.fn()} onFocus={vi.fn()} onKeyDown={vi.fn()} onScroll={vi.fn()}/>);
    expect(screen.getAllByRole('treeitem').length).toBeLessThan(60);
    expect(screen.getByText(/Windowed tree:/)).toHaveTextContent(`of ${rows.length} visible rows rendered`);
  });
});
