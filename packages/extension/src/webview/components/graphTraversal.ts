import type { MultiDirectedGraph } from "graphology";
import { bfsFromNode } from "graphology-traversal";

import type {
  GraphEdgeAttributes,
  SelectionTraversal,
  TracePath,
  TraceState,
} from "./graphViewTypes.js";

/**
 * Graph-traversal derivations for the GraphView: the depth/selection
 * neighbourhood walk (`computeSelection`) and the trace-path summary
 * (`computeTracePath`). Both are pure — graph + state in, result out — with no
 * React or Sigma coupling, so they live outside the component and are unit
 * testable in isolation.
 */

/**
 * BFS the outbound neighbourhood of `selectedNodeId` to `maxDepth`, returning
 * the visited node/edge sets plus the per-hop layering the trace inspector and
 * depth filter consume. Returns null when there is no (or an unknown) selection.
 *
 * The `DEFINES` quirk — re-adding the source node when an outbound edge is a
 * DEFINES edge — is preserved from the original implementation so downstream
 * consumers see byte-identical traversal output.
 */
export function computeSelection(
  graph: MultiDirectedGraph,
  selectedNodeId: string | null,
  maxDepth: number,
): SelectionTraversal | null {
  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    return null;
  }

  const nodeIds = new Set<string>([selectedNodeId]);
  // Group visited nodes by depth so we can walk outbound edges layer-by-layer below.
  const nodesByDepth = new Map<number, string[]>([[0, [selectedNodeId]]]);

  bfsFromNode(
    graph,
    selectedNodeId,
    (node, _attrs, depth) => {
      // bfsFromNode invokes the callback for the start node at depth 0 too.
      if (node !== selectedNodeId) {
        nodeIds.add(node);
        const layer = nodesByDepth.get(depth);
        if (layer === undefined) {
          nodesByDepth.set(depth, [node]);
        } else {
          layer.push(node);
        }
      }
      // Returning true prunes further traversal beyond this node. We prune when
      // we've reached maxDepth so the next layer is never expanded.
      return depth >= maxDepth;
    },
    { mode: "outbound" },
  );

  // Walk outbound edges per BFS layer to reproduce hopLayers / orderedEdgeIds
  // exactly as the legacy implementation produced them. The DEFINES quirk
  // (re-adding the source node when the edge is DEFINES) is preserved.
  const edgeIds = new Set<string>();
  const orderedEdgeIds: string[] = [];
  const hopLayers: string[][] = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    const frontier = nodesByDepth.get(depth);
    if (frontier === undefined) {
      break;
    }
    const layerEdges: string[] = [];
    for (const currentNodeId of frontier) {
      graph.forEachOutboundEdge(currentNodeId, (edge, attributes, _source, target) => {
        edgeIds.add(edge);
        orderedEdgeIds.push(edge);
        layerEdges.push(edge);

        // Ensure all reachable targets at depth+1 are in nodeIds even if BFS
        // pruned them (e.g. when an edge crosses to a node already visited at
        // the same or lower depth).
        nodeIds.add(target);

        if ((attributes as GraphEdgeAttributes).edgeKind === "DEFINES") {
          nodeIds.add(currentNodeId);
        }
      });
    }
    if (layerEdges.length > 0) {
      hopLayers.push(layerEdges);
    }
  }

  return {
    selectedNodeId,
    nodeIds,
    edgeIds,
    orderedEdgeIds,
    hopLayers,
    maxDepth,
  };
}

/**
 * Derive a TracePath summary from the trace state for the right-rail
 * TraceInspector (slice 023). Returns null when the path is empty.
 * `layersCrossed` is currently always empty because `arch_layer` is a
 * slice 026 column; we render gracefully when absent per spec CC-003.
 */
export function computeTracePath(graph: MultiDirectedGraph, state: TraceState): TracePath | null {
  if (state.pathNodeIds.length === 0 || state.startNodeId === null || state.endNodeId === null) {
    return null;
  }

  const filePaths = new Set<string>();
  const frameworks = new Set<string>();
  for (const nodeId of state.pathNodeIds) {
    if (!graph.hasNode(nodeId)) {
      continue;
    }
    const filePath = graph.getNodeAttribute(nodeId, "filePath") as string | undefined;
    if (typeof filePath === "string" && filePath.length > 0) {
      filePaths.add(filePath);
    }
    const framework = graph.getNodeAttribute(nodeId, "framework") as string | undefined;
    if (typeof framework === "string" && framework.length > 0) {
      frameworks.add(framework);
    }
  }

  return {
    startNodeId: state.startNodeId,
    endNodeId: state.endNodeId,
    hopCount: state.pathEdgeIds.length,
    fileCount: filePaths.size,
    layersCrossed: [],
    crossesFrameworkBoundary: frameworks.size > 1,
    nodeIds: state.pathNodeIds,
    edgeIds: state.pathEdgeIds,
  };
}
