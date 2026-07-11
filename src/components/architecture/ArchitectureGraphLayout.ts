export interface GraphNode {
  id: string;
  groupId?: string;
  isPrimary?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  groups: Map<string, { x: number; y: number; width: number; height: number }>;
  width: number;
  height: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const X_SPACING = 100; // Space between columns
const Y_SPACING = 30;  // Space between rows
const GROUP_PADDING = 30; // Padding inside a group container
const GROUP_TOP_PADDING = 40; // Extra padding at top for group label

export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], primaryId?: string): LayoutResult {
  const nodeLayouts = new Map<string, { x: number; y: number; width: number; height: number }>();
  const groupLayouts = new Map<string, { x: number; y: number; width: number; height: number }>();
  
  if (nodes.length === 0) {
    return { nodes: nodeLayouts, groups: groupLayouts, width: 0, height: 0 };
  }

  // 1. Assign layers using BFS from primary node
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  
  const startNode = nodes.find(n => n.id === primaryId) || nodes[0];
  layers.set(startNode.id, 0);
  visited.add(startNode.id);
  
  const queue = [startNode.id];
  
  // Build adjacency
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
    outEdges.get(edge.source)!.push(edge.target);
    if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
    inEdges.get(edge.target)!.push(edge.source);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLayer = layers.get(curr)!;
    
    // Dependencies go to currentLayer - 1
    const deps = outEdges.get(curr) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        layers.set(dep, currLayer - 1);
        queue.push(dep);
      }
    }
    
    // Dependents go to currentLayer + 1
    const depds = inEdges.get(curr) || [];
    for (const depd of depds) {
      if (!visited.has(depd)) {
        visited.add(depd);
        layers.set(depd, currLayer + 1);
        queue.push(depd);
      }
    }
  }

  // Any unvisited nodes (disconnected) go to layer 0
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  // 2. Group nodes by their defined groupId
  const groupsMap = new Map<string, string[]>();
  for (const node of nodes) {
    const gId = node.groupId || `__NODE__${node.id}`;
    if (!groupsMap.has(gId)) groupsMap.set(gId, []);
    groupsMap.get(gId)!.push(node.id);
  }

  // 3. For each group, we compute its overall layer (average)
  const groupLayers = new Map<string, number>();
  for (const [gId, gNodes] of groupsMap.entries()) {
    let sum = 0;
    for (const n of gNodes) sum += layers.get(n)!;
    groupLayers.set(gId, Math.round(sum / gNodes.length));
  }

  // Group groups by layer
  const layersOfGroups = new Map<number, string[]>();
  for (const [gId, layer] of groupLayers.entries()) {
    if (!layersOfGroups.has(layer)) layersOfGroups.set(layer, []);
    layersOfGroups.get(layer)!.push(gId);
  }
  
  // Sort layers
  const sortedLayers = Array.from(layersOfGroups.keys()).sort((a, b) => a - b);
  
  let currentX = 0;
  let maxGlobalY = 0;

  for (const layer of sortedLayers) {
    const layerGroups = layersOfGroups.get(layer)!;
    
    let currentY = 0;
    let maxLayerWidth = 0;

    for (const gId of layerGroups) {
      const gNodes = groupsMap.get(gId)!;
      // Inside a group, lay out nodes in a grid if many, or just vertical stack
      // For simplicity, vertical stack inside the group
      const cols = Math.ceil(Math.sqrt(gNodes.length));
      
      let groupW = 0;
      let groupH = 0;

      if (!gId.startsWith('__NODE__')) {
        // Group container
        for (let i = 0; i < gNodes.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          
          const nx = currentX + GROUP_PADDING + col * (NODE_WIDTH + 20);
          const ny = currentY + GROUP_TOP_PADDING + row * (NODE_HEIGHT + 20);
          
          nodeLayouts.set(gNodes[i], { x: nx, y: ny, width: NODE_WIDTH, height: NODE_HEIGHT });
          
          groupW = Math.max(groupW, GROUP_PADDING + (col + 1) * (NODE_WIDTH + 20));
          groupH = Math.max(groupH, GROUP_TOP_PADDING + (row + 1) * (NODE_HEIGHT + 20));
        }
        
        groupLayouts.set(gId, { x: currentX, y: currentY, width: groupW, height: groupH });
        currentY += groupH + Y_SPACING;
        maxLayerWidth = Math.max(maxLayerWidth, groupW);
      } else {
        // No group container, just stack nodes
        for (let i = 0; i < gNodes.length; i++) {
          const nx = currentX;
          const ny = currentY;
          nodeLayouts.set(gNodes[i], { x: nx, y: ny, width: NODE_WIDTH, height: NODE_HEIGHT });
          currentY += NODE_HEIGHT + Y_SPACING;
          maxLayerWidth = Math.max(maxLayerWidth, NODE_WIDTH);
        }
      }
    }
    
    maxGlobalY = Math.max(maxGlobalY, currentY);
    currentX += maxLayerWidth + X_SPACING;
  }

  return { nodes: nodeLayouts, groups: groupLayouts, width: currentX, height: maxGlobalY };
}

export function computeOrthogonalEdge(
  sourceBox: { x: number; y: number; width: number; height: number },
  targetBox: { x: number; y: number; width: number; height: number }
): { x: number; y: number }[] {
  // If target is to the right (forward edge)
  if (targetBox.x > sourceBox.x + sourceBox.width) {
    const startX = sourceBox.x + sourceBox.width;
    const startY = sourceBox.y + sourceBox.height / 2;
    const endX = targetBox.x;
    const endY = targetBox.y + targetBox.height / 2;
    const midX = startX + (endX - startX) / 2;
    return [
      { x: startX, y: startY },
      { x: midX, y: startY },
      { x: midX, y: endY },
      { x: endX, y: endY }
    ];
  } else if (targetBox.x < sourceBox.x) {
    // If target is to the left (back edge)
    // Route above the nodes to avoid passing through them
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y;
    const endX = targetBox.x + targetBox.width / 2;
    const endY = targetBox.y;
    const midY = Math.min(startY, endY) - 30;
    return [
      { x: startX, y: startY },
      { x: startX, y: midY },
      { x: endX, y: midY },
      { x: endX, y: endY }
    ];
  } else {
    // Same column
    // Route through the right gutter
    const startX = sourceBox.x + sourceBox.width;
    const startY = sourceBox.y + sourceBox.height / 2;
    const endX = targetBox.x + targetBox.width;
    const endY = targetBox.y + targetBox.height / 2;
    const midX = startX + 40;
    return [
      { x: startX, y: startY },
      { x: midX, y: startY },
      { x: midX, y: endY },
      { x: endX, y: endY }
    ];
  }
}
