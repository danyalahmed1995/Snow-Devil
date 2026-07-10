import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Search, Minimize2, ZoomIn, ZoomOut, Expand, Shrink, RefreshCw, Layers, Map as MapIcon, Maximize } from 'lucide-react';
import { ComponentIcon } from './ComponentIcon';
import type { PullRequestArchitectureImpact, ArchitectureComponent } from '../../architecture/types';
import { useTabsStore } from '../../stores/tabs-store';
import { useArchitectureStore, type ComponentMapGroupingMode } from '../../architecture/architecture-store';
import { getRelevantComponents, getRelevantComponentIds, getShortestUniqueQualifier } from '../../architecture/graph-utils';
import { computeLayout, computeOrthogonalEdge } from './ArchitectureGraphLayout';

function getGroupId(component: ArchitectureComponent, mode: ComponentMapGroupingMode): string | undefined {
  if (mode === 'none') return undefined;
  if (mode === 'kind') return component.kind;
  if (mode === 'rootPath') {
    if (component.rootPaths && component.rootPaths.length > 0) return component.rootPaths[0];
    return undefined;
  }
  if (mode === 'package') {
    if (component.manifestPaths && component.manifestPaths.length > 0) return component.manifestPaths[0];
    return undefined;
  }
  if (mode === 'subsystem') {
    const path = component.rootPaths?.[0] || component.manifestPaths?.[0];
    if (path) {
      const parts = path.split('/');
      return parts.length > 1 ? parts[0] : path;
    }
    return component.kind;
  }
  return undefined;
}

export function FullComponentMap({ impact, onSelect }: { impact: PullRequestArchitectureImpact; onSelect: (id: string) => void }) {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const mapState = useArchitectureStore(s => s.states[activeTabId]?.mapState);
  const setMapState = useArchitectureStore.getState().setMapState;
  const selectedComponentId = useArchitectureStore(s => s.states[activeTabId]?.selectedComponentId);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  if (!mapState) return null;

  const { groupingMode, filters, expandedGroups, zoom, panX, panY, isFullScreen } = mapState;

  // Filter nodes based on filters
  const allRelevantComponents = useMemo(() => getRelevantComponents(impact), [impact]);
  
  const visibleComponents = useMemo(() => {
    let comps = allRelevantComponents;
    const primaryId = impact.primaryComponentId;
    
    if (!filters.dependencies || !filters.dependents || !filters.indirect) {
      comps = comps.filter(c => {
        if (c.id === primaryId) return true;
        const isAffected = impact.affectedComponents.some(a => a.component.id === c.id);
        if (isAffected) return true;
        
        const isDirectDep = impact.dependencyChanges.some(e => e.fromComponentId === primaryId && e.toComponentId === c.id);
        const isDirectDependent = impact.dependencyChanges.some(e => e.toComponentId === primaryId && e.fromComponentId === c.id);
        
        if (!filters.dependencies && isDirectDep) return false;
        if (!filters.dependents && isDirectDependent) return false;
        
        const isDirect = isDirectDep || isDirectDependent;
        if (!filters.indirect && !isDirect) return false;
        
        return true;
      });
    }
    return comps;
  }, [allRelevantComponents, filters, impact]);

  const nodes = useMemo(() => {
    return visibleComponents.map(c => ({
      id: c.id,
      groupId: getGroupId(c, groupingMode),
      isPrimary: c.id === impact.primaryComponentId
    }));
  }, [visibleComponents, groupingMode, impact.primaryComponentId]);

  const edges = useMemo(() => {
    const visibleIds = new Set(visibleComponents.map(c => c.id));
    const edgeMap = new Map<string, { source: string, target: string, change: string }>();
    
    for (const e of impact.snapshot.dependencies) {
      if (visibleIds.has(e.fromComponentId) && visibleIds.has(e.toComponentId)) {
        edgeMap.set(`${e.fromComponentId}->${e.toComponentId}`, { source: e.fromComponentId, target: e.toComponentId, change: 'none' });
      }
    }
    
    for (const e of impact.dependencyChanges) {
      if (visibleIds.has(e.fromComponentId) && visibleIds.has(e.toComponentId)) {
        edgeMap.set(`${e.fromComponentId}->${e.toComponentId}`, { source: e.fromComponentId, target: e.toComponentId, change: e.change });
      }
    }
    
    return Array.from(edgeMap.values()).map(e => {
      let type = 'normal';
      if (e.change === 'new') type = 'new';
      else if (e.change === 'removed') type = 'removed';
      else if (e.change === 'modified') type = 'modified';
      else if (e.source !== impact.primaryComponentId && e.target !== impact.primaryComponentId) type = 'indirect';
      return { ...e, type };
    });
  }, [impact.snapshot.dependencies, impact.dependencyChanges, visibleComponents, impact.primaryComponentId]);

  const layout = useMemo(() => computeLayout(nodes, edges, impact.primaryComponentId), [nodes, edges, impact.primaryComponentId]);

  // Handle Search Focus
  const lastMatchedId = useRef<string | null>(null);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const q = searchQuery.toLowerCase();
      const match = visibleComponents.find(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
      if (match && match.id !== lastMatchedId.current) {
        lastMatchedId.current = match.id;
        const nodeLayout = layout.nodes.get(match.id);
        if (nodeLayout && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const targetPanX = (rect.width / 2) - (nodeLayout.x + nodeLayout.width / 2) * zoom;
          const targetPanY = (rect.height / 2) - (nodeLayout.y + nodeLayout.height / 2) * zoom;
          setMapState(activeTabId, { panX: targetPanX, panY: targetPanY });
          onSelect(match.id);
        }
      }
    } else {
      lastMatchedId.current = null;
    }
  }, [searchQuery, layout, zoom, visibleComponents, activeTabId, setMapState, onSelect]);

  // Handle Escape for Full Screen
  useEffect(() => {
    if (!isFullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapState(activeTabId, { isFullScreen: false });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, activeTabId, setMapState]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setMapState(activeTabId, { panX: e.clientX - dragStart.x, panY: e.clientY - dragStart.y });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setMapState(activeTabId, { zoom: Math.max(0.1, Math.min(5, newZoom)) });
  };

  const fitToView = useCallback(() => {
    if (!containerRef.current || layout.width === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 40;
    const scaleX = (rect.width - padding * 2) / Math.max(1, layout.width);
    const scaleY = (rect.height - padding * 2) / Math.max(1, layout.height);
    const newZoom = Math.min(1, scaleX, scaleY);
    
    const newPanX = (rect.width - layout.width * newZoom) / 2;
    const newPanY = (rect.height - layout.height * newZoom) / 2;
    
    setMapState(activeTabId, { zoom: newZoom, panX: newPanX, panY: newPanY });
  }, [layout, activeTabId, setMapState]);

  const focusChanged = useCallback(() => {
    if (!containerRef.current) return;
    const primaryLayout = impact.primaryComponentId ? layout.nodes.get(impact.primaryComponentId) : null;
    if (primaryLayout) {
      const rect = containerRef.current.getBoundingClientRect();
      const targetPanX = (rect.width / 2) - (primaryLayout.x + primaryLayout.width / 2) * zoom;
      const targetPanY = (rect.height / 2) - (primaryLayout.y + primaryLayout.height / 2) * zoom;
      setMapState(activeTabId, { panX: targetPanX, panY: targetPanY });
    }
  }, [impact.primaryComponentId, layout, zoom, activeTabId, setMapState]);

  const resetLayout = useCallback(() => {
    setMapState(activeTabId, { 
      groupingMode: 'subsystem', 
      filters: { dependencies: true, dependents: true, indirect: true, external: true },
      expandedGroups: []
    });
    setTimeout(fitToView, 50);
  }, [activeTabId, setMapState, fitToView]);

  const toggleFullScreen = useCallback(() => {
    setMapState(activeTabId, { isFullScreen: !isFullScreen });
    setTimeout(fitToView, 50);
  }, [activeTabId, setMapState, isFullScreen, fitToView]);

  return <div className={`full-component-map ${isFullScreen ? 'is-full-screen' : ''}`}>
    <header className="full-component-map__toolbar">
      <div className="toolbar-group">
        <button onClick={fitToView} title="Fit to view"><Maximize size={14}/> Fit</button>
        <button onClick={focusChanged} title="Focus changed"><MapIcon size={14}/> Focus</button>
        <button onClick={resetLayout} title="Reset layout"><RefreshCw size={14}/> Reset</button>
        {!isFullScreen && <button onClick={toggleFullScreen} title="Full screen"><Expand size={14}/> Full screen</button>}
      </div>
      <div className="toolbar-group">
        <label><input type="checkbox" checked={filters.dependencies} onChange={e => setMapState(activeTabId, s => ({ filters: { ...s.filters, dependencies: e.target.checked } }))}/> Dependencies</label>
        <label><input type="checkbox" checked={filters.dependents} onChange={e => setMapState(activeTabId, s => ({ filters: { ...s.filters, dependents: e.target.checked } }))}/> Dependents</label>
        <label><input type="checkbox" checked={filters.indirect} onChange={e => setMapState(activeTabId, s => ({ filters: { ...s.filters, indirect: e.target.checked } }))}/> Indirect</label>
      </div>
      <div className="toolbar-group">
        <Layers size={14} className="toolbar-icon"/>
        <select value={groupingMode} onChange={e => setMapState(activeTabId, { groupingMode: e.target.value as ComponentMapGroupingMode })}>
          <option value="subsystem">Group by Subsystem</option>
          <option value="rootPath">Group by Root Path</option>
          <option value="package">Group by Package</option>
          <option value="kind">Group by Kind</option>
          <option value="none">No Grouping</option>
        </select>
      </div>
      <div className="toolbar-group toolbar-search">
        <Search size={14} className="toolbar-icon"/>
        <input type="text" placeholder="Search components..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if(e.key === 'Escape') setSearchQuery('') }} />
      </div>
      {isFullScreen && (
        <button className="full-component-map__exit-fullscreen" onClick={toggleFullScreen}>
          <Shrink size={14} /> Exit full screen
        </button>
      )}
    </header>
    
    <div className={`full-component-map__canvas architecture-canvas-pan ${isDragging ? 'is-dragging' : ''}`} ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={handleWheel}>
      <div className="full-component-map__layer" style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}>
        
        {/* Draw Groups */}
        {Array.from(layout.groups.entries()).map(([gId, gLayout]) => {
          const isExpanded = true; // For now always expanded
          return <div key={gId} className="full-component-map__group" style={{ left: gLayout.x, top: gLayout.y, width: gLayout.width, height: gLayout.height }}>
            <span className="full-component-map__group-label">{gId}</span>
          </div>;
        })}

        {/* Draw Edges */}
        <svg className="full-component-map__edges" width={Math.max(100, layout.width)} height={Math.max(100, layout.height)} style={{ width: Math.max(100, layout.width), height: Math.max(100, layout.height) }}>
          <defs>
            <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="rgba(79,143,239,.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-is-new" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#3fb950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-is-removed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#f85149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-is-modified" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#d29922" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-is-indirect" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="rgba(139,148,158,.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {edges.map(e => {
            const sLayout = layout.nodes.get(e.source);
            const tLayout = layout.nodes.get(e.target);
            if (!sLayout || !tLayout) return null;
            const points = computeOrthogonalEdge(sLayout, tLayout);
            const pathData = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
            const statusClass = e.type !== 'normal' && e.type !== 'indirect' ? `is-${e.type}` : '';
            const indirectClass = e.type === 'indirect' ? 'is-indirect' : '';
            
            return (
              <g key={`${e.source}-${e.target}`} className={`full-component-map__edge-group`}>
                <path d={pathData} className="full-component-map__edge-hitbox" />
                <path
                  className={`full-component-map__edge ${statusClass} ${indirectClass}`}
                  d={pathData}
                  markerEnd={`url(#arrow-${statusClass ? statusClass : indirectClass ? 'is-indirect' : 'default'})`}
                />
                <circle cx={points[0].x} cy={points[0].y} r={3 * (1 / zoom)} className={`full-component-map__port is-${e.type}`} />
              </g>
            );
          })}
        </svg>

        {/* Draw Nodes */}
        {visibleComponents.map(c => {
          const nLayout = layout.nodes.get(c.id);
          if (!nLayout) return null;
          const isPrimary = c.id === impact.primaryComponentId;
          const isSelected = c.id === selectedComponentId;
          const isAffected = impact.affectedComponents.some(a => a.component.id === c.id);
          const qualifier = getShortestUniqueQualifier(c, allRelevantComponents);
          const isMatch = searchQuery && (c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.toLowerCase().includes(searchQuery.toLowerCase()));

          return <button key={c.id} className={`full-component-map__node ${isPrimary ? 'is-primary' : ''} ${isAffected ? 'is-affected' : ''} ${isSelected ? 'is-selected' : ''} ${isMatch ? 'is-match' : ''}`} style={{ left: nLayout.x, top: nLayout.y, width: nLayout.width, height: nLayout.height }} onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}>
            <ComponentIcon component={c} />
            <span className="architecture-node__label">
              <strong>{c.name}</strong>
              <small>{qualifier} {isPrimary ? '· Primary' : isAffected ? '· Changed' : ''}</small>
            </span>
          </button>;
        })}
      </div>
    </div>
  </div>;
}
