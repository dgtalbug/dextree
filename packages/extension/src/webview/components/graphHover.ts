import type { MultiDirectedGraph } from "graphology";

export interface HoverNeighborhood {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

const EMPTY: HoverNeighborhood = {
  nodeIds: new Set(),
  edgeIds: new Set(),
};

export function computeHoverNeighborhood(
  graph: MultiDirectedGraph,
  hoveredNodeId: string | null,
): HoverNeighborhood {
  if (hoveredNodeId === null || !graph.hasNode(hoveredNodeId)) {
    return { nodeIds: new Set(EMPTY.nodeIds), edgeIds: new Set(EMPTY.edgeIds) };
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
