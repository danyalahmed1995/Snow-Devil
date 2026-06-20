import { useEffect, useRef, useState } from 'react';
import { Sigma } from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { useGraphStore } from '../../stores/graph-store';
import { useTabsStore } from '../../stores/tabs-store';
import { useAuthStore } from '../../stores/auth-store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './GraphCanvas.css';

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const { graph, selectedNodeId, selectedNodeType, setSelectedNodeId, loadDemoData, loadRealData } = useGraphStore();
  const { isAuthenticated } = useAuthStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Load data on mount or auth change
  useEffect(() => {
    if (isAuthenticated) {
      setIsSyncing(true);
      setSyncError(null);
      
      // Start background sync
      invoke('start_sync').catch((e: any) => {
        console.error('Sync failed:', e);
        setSyncError(e.toString());
      }).finally(() => {
        setIsSyncing(false);
      });
      
      // Load whatever is in the DB immediately (might be empty)
      loadRealData();
      
      // Listen for when sync finishes
      const unlistenPromise = listen('sync-complete', () => {
        loadRealData();
      });
      
      return () => {
        unlistenPromise.then(f => f());
      };
    } else {
      loadDemoData();
    }
  }, [loadDemoData, loadRealData, isAuthenticated]);

  // Handle highlight
  useEffect(() => {
    if (!sigmaRef.current) return;
    
    const sigma = sigmaRef.current;
    
    if (selectedNodeId) {
      sigma.setSetting('nodeReducer', (node, data) => {
        const isSelected = node === selectedNodeId;
        const isNeighbor = graph.areNeighbors(node, selectedNodeId);
        if (isSelected || isNeighbor) return { ...data, zIndex: 1 };
        return { ...data, color: '#2d333b', zIndex: 0 };
      });
      sigma.setSetting('edgeReducer', (edge, data) => {
        const hasSelectedEndpoint = graph.hasExtremity(edge, selectedNodeId);
        if (hasSelectedEndpoint) return { ...data, size: 2, color: '#58a6ff' };
        return { ...data, color: '#2d333b', hidden: true };
      });
    } else if (selectedNodeType) {
      sigma.setSetting('nodeReducer', (_node, data) => {
        const isMatch = data.entityType === selectedNodeType;
        if (isMatch) return { ...data, zIndex: 1 };
        return { ...data, color: '#2d333b', zIndex: 0 };
      });
      sigma.setSetting('edgeReducer', (_edge, data) => {
        return { ...data, color: '#2d333b' };
      });
    } else {
      sigma.setSetting('nodeReducer', null);
      sigma.setSetting('edgeReducer', null);
    }
  }, [selectedNodeId, selectedNodeType, graph]);

  // Init Sigma
  useEffect(() => {
    if (containerRef.current) {
      if (graph.order > 0) {
        if (!sigmaRef.current) {
          sigmaRef.current = new Sigma(graph, containerRef.current, {
            allowInvalidContainer: true,
            renderEdgeLabels: true,
          });

          sigmaRef.current.on('clickNode', (e) => {
            setSelectedNodeId(e.node);
          });

          sigmaRef.current.on('doubleClickNode', (e) => {
            const nodeData = sigmaRef.current?.getGraph().getNodeAttributes(e.node);
            if (!nodeData) return;

            const nodeType = nodeData.type || 'user';
            const kindMap: Record<string, any> = {
              'user': 'profile',
              'repo': 'repository',
              'issue': 'issue',
              'pr': 'pullRequest'
            };
            const bKind = kindMap[nodeType] || 'githubPage';
            
            let url = `https://github.com/${e.node}`;
            if (nodeType === 'issue' || nodeType === 'pr') {
               const parts = e.node.split('/');
               if(parts.length >= 3) {
                 url = `https://github.com/${parts[0]}/${parts[1]}/${nodeType === 'pr' ? 'pull' : 'issues'}/${parts[2]}`;
               }
            }

            useTabsStore.getState().openBrowserTab(
              `entity-${e.node}`,
              bKind,
              nodeData.title || e.node,
              url,
              false,
              true
            );
          });

          sigmaRef.current.on('clickEdge', () => {
            // handle edge click if needed
          });
        } else {
          // If sigma already exists, just update its graph instance
          sigmaRef.current.getGraph().clear();
          sigmaRef.current.getGraph().import(graph.export());
          sigmaRef.current.refresh();
        }
        
        // Run layout
        forceAtlas2.assign(sigmaRef.current.getGraph(), { iterations: 100, settings: forceAtlas2.inferSettings(sigmaRef.current.getGraph()) });
      } else if (sigmaRef.current) {
        // Clear graph if empty
        sigmaRef.current.getGraph().clear();
        sigmaRef.current.refresh();
      }
    }

    return () => {
      // Don't kill sigma unconditionally when graph reference changes, only on unmount
    };
  }, [graph, setSelectedNodeId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="graph-container" ref={containerRef}></div>
      {isSyncing && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(13, 17, 23, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#58a6ff',
          zIndex: 10,
          backdropFilter: 'blur(2px)'
        }}>
          <div className="spinner" style={{
            width: '40px', height: '40px', 
            border: '3px solid rgba(88, 166, 255, 0.3)',
            borderTopColor: '#58a6ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px'
          }}></div>
          <style>{`
            @keyframes spin { 
              to { transform: rotate(360deg); } 
            }
          `}</style>
          <h2>Syncing Data from GitHub...</h2>
          <p style={{ color: '#8b949e', marginTop: '8px' }}>Pulling your repositories and profile...</p>
        </div>
      )}
      {syncError && !isSyncing && (
        <div style={{
          position: 'absolute',
          top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid var(--error)',
          color: 'var(--error)',
          padding: '12px 24px',
          borderRadius: '6px',
          zIndex: 10,
          maxWidth: '80%',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Sync Failed</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>{syncError}</p>
        </div>
      )}
    </div>
  );
}
