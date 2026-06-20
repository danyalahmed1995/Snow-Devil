import { useGraphStore } from '../../stores/graph-store';
import { useTabsStore, isNativeTab } from '../../stores/tabs-store';
import './Inspector.css';

export function Inspector() {
  const { graph, selectedNodeId } = useGraphStore();
  const { tabs, activeTabId } = useTabsStore();
  
  const activeTab = tabs.find(t => t.id === activeTabId);

  let content: React.ReactNode;

  if (activeTab && isNativeTab(activeTab) && activeTab.kind === 'map') {
    let nodeData = null;
    if (selectedNodeId && graph.hasNode(selectedNodeId)) {
      nodeData = graph.getNodeAttributes(selectedNodeId);
    }
    
    if (!nodeData) {
      content = <p className="inspector-empty">Select a node to view details</p>;
    } else {
      content = (
        <div className="inspector-details">
          <div className="detail-row">
            <span className="badge" style={{ backgroundColor: nodeData.color }}>{nodeData.type}</span>
          </div>
          <h4>{nodeData.title}</h4>
          {nodeData.subtitle && <p className="subtitle">{nodeData.subtitle}</p>}
          
          {nodeData.url && (
            <a href={nodeData.url} target="_blank" rel="noreferrer" className="open-link">
              Open on GitHub
            </a>
          )}
          
          <div className="metadata">
            {Object.entries(nodeData.metadata || {}).map(([key, value]) => (
              <div key={key} className="meta-row">
                <span className="meta-key">{key}:</span>
                <span className="meta-val">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  } else {
    content = (
      <div className="inspector-details">
        <p className="inspector-empty">
          Inspector is inactive for {activeTab?.title || 'this view'}. Switch to the Graph Map to inspect nodes.
        </p>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="inspector-header">
        <h3>Inspector</h3>
      </div>
      <div className="inspector-content">
        {content}
      </div>
    </div>
  );
}
