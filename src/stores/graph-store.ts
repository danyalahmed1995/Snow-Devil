import { create } from 'zustand';
import Graph from 'graphology';
import { invoke } from '@tauri-apps/api/core';
import { demoNodes, demoEdges } from '../lib/demo-data';

interface GraphState {
  graph: Graph;
  selectedNodeId: string | null;
  selectedNodeType: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeType: (type: string | null) => void;
  loadDemoData: () => void;
  loadRealData: () => Promise<void>;
}

export const useGraphStore = create<GraphState>((set) => {
  const initialGraph = new Graph();

  return {
    graph: initialGraph,
    selectedNodeId: null,
    selectedNodeType: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedNodeType: null }),
    setSelectedNodeType: (type) => set({ selectedNodeType: type, selectedNodeId: null }),
    loadDemoData: () => {
      const g = new Graph();
      demoNodes.forEach(node => {
        g.addNode(node.id, {
          ...node,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: 15,
          color: getColorForType(node.type),
          entityType: node.type,
          type: 'circle',
          label: node.title
        });
      });
      demoEdges.forEach(edge => {
        g.addEdge(edge.sourceId, edge.targetId, {
          ...edge,
          entityType: edge.type,
          type: 'line',
          size: 1,
          color: '#8b949e'
        });
      });
      set({ graph: g });
    },
    loadRealData: async () => {
      try {
        const data = await invoke<{nodes: any[], edges: any[]}>('get_graph_data');
        const g = new Graph();
        
        data.nodes.forEach(node => {
          g.addNode(node.id, {
            id: node.id,
            entityType: node.node_type,
            type: 'circle',
            title: node.title,
            url: node.url,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 15,
            color: getColorForType(node.node_type),
            label: node.title
          });
        });
        
        data.edges.forEach(edge => {
          if (g.hasNode(edge.source_id) && g.hasNode(edge.target_id)) {
            g.addEdge(edge.source_id, edge.target_id, {
              id: edge.id,
              entityType: edge.edge_type,
              type: 'line',
              size: 1,
              color: '#8b949e'
            });
          }
        });
        
        set({ graph: g });
      } catch (e) {
        console.error('Failed to load graph data:', e);
      }
    }
  };
});

function getColorForType(type: string) {
  switch (type) {
    case 'user': return '#2f81f7';
    case 'organization': return '#d29922';
    case 'repository': return '#238636';
    case 'pull_request': return '#8957e5';
    case 'issue': return '#3fb950';
    default: return '#c9d1d9';
  }
}
