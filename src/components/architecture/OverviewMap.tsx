import { Info, GitBranch, Network } from 'lucide-react';
import type { PullRequestArchitectureImpact } from '../../architecture/types';
import { useTabsStore } from '../../stores/tabs-store';
import { useArchitectureStore } from '../../architecture/architecture-store';
import { calculateHiddenComponentCount } from '../../architecture/graph-utils';

function componentName(impact: PullRequestArchitectureImpact, id?: string) { return impact.snapshot.components.find(component => component.id === id)?.name ?? 'Unmapped'; }

export function OverviewMap({ impact, onSelect }: { impact: PullRequestArchitectureImpact; onSelect: (id: string) => void }) {
  const primary = impact.snapshot.components.find(component => component.id === impact.primaryComponentId);
  const focusedIds = new Set([...impact.directBlastRadius, ...impact.indirectBlastRadius, ...impact.affectedComponents.map(item => item.component.id)]);
  const others = impact.snapshot.components.filter(component => component.id !== primary?.id && focusedIds.has(component.id)).slice(0, 6);
  const nodes = primary ? [primary, ...others] : others;
  
  const visibleNodeIds = new Set(nodes.map(n => n.id));
  const hiddenCount = calculateHiddenComponentCount(impact, visibleNodeIds);
  
  const position = (index: number) => index === 0 ? { x: 50, y: 50 } : { x: index % 2 ? 18 : 82, y: 18 + Math.floor((index - 1) / 2) * 30 };
  
  const activeTabId = useTabsStore(s => s.activeTabId);
  const openComponentMap = () => useArchitectureStore.getState().setSection(activeTabId, 'map');

  return <article className="architecture-panel architecture-map"><header><div><h3>Component Dependency Map</h3><p>Focused on changed components and bounded repository dependencies</p></div><span className="architecture-legend"><i/>Changed <b/>Dependency</span></header><div className={`architecture-map__canvas ${nodes.length === 1 ? 'is-single' : ''}`}>
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">{nodes.slice(1).map((node, index) => { const point = position(index + 1); const changed = impact.dependencyChanges.some(edge => (edge.fromComponentId === primary?.id && edge.toComponentId === node.id) || (edge.toComponentId === primary?.id && edge.fromComponentId === node.id)); return <line key={node.id} x1="50" y1="50" x2={point.x} y2={point.y} className={changed ? 'is-new' : ''}/>; })}</svg>
    {nodes.map((node, index) => { const point = position(index); const affected = impact.affectedComponents.some(item => item.component.id === node.id); return <button key={node.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} className={`${index === 0 ? 'is-primary' : ''} ${affected ? 'is-affected' : ''}`} onClick={() => onSelect(node.id)}><span className="architecture-node__icon" aria-hidden="true"><Network size={13}/></span><span className="architecture-node__label"><strong>{node.name}</strong><small>{index === 0 ? 'Primary' : affected ? 'Changed' : 'Dependency'} · {node.kind}</small></span></button>; })}
    {!nodes.length && <div className="architecture-map__empty">No component boundary could be identified.</div>}
  </div><footer>
    <div className="architecture-map__footer-left">
      {impact.dependencyChanges.length ? impact.dependencyChanges.slice(0, 2).map(change => <span key={`${change.change}:${change.fromComponentId}:${change.toComponentId}`}><GitBranch size={11}/>{change.change === 'new' ? 'New dependency' : change.change === 'removed' ? 'Removed dependency' : change.change === 'modified' ? 'Modified dependency' : 'Existing dependency touched'}: {componentName(impact, change.fromComponentId)} → {componentName(impact, change.toComponentId)}</span>) : <span><Info size={11}/>No cross-component dependency change found in the available patch.</span>}
    </div>
    {hiddenCount > 0 && <div className="architecture-map__footer-right"><button className="architecture-map__view-full" onClick={openComponentMap}>View full component map · {hiddenCount} related components</button></div>}
  </footer></article>;
}
