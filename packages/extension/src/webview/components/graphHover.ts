import type { MultiDirectedGraph } from "graphology";

export interface HoverNeighborhood {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export function computeHoverNeighborhood(
  graph: MultiDirectedGraph,
  hoveredNodeId: string | null,
): HoverNeighborhood {
  if (hoveredNodeId === null || !graph.hasNode(hoveredNodeId)) {
    return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
  }

  const nodeIds = new Set<string>([hoveredNodeId]);
  const edgeIds = new Set<string>();

  graph.forEachEdge(hoveredNodeId, (edge, _attrs, source, target) => {
    edgeIds.add(edge);
    nodeIds.add(source);
    nodeIds.add(target);
  });

  return { nodeIds, edgeIds };
}
