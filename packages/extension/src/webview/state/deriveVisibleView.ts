import type { MultiDirectedGraph } from "graphology";

import type { GraphViewState } from "./graphViewStore.js";
import type { VisibleView } from "./visibleView.js";

/**
 * The graph attributes the derivation reads off each node to decide membership.
 * Mirrors the keys the Sigma node reducer consults: `nodeKind`/`symbolKind` for
 * the node-type filter and `decoratorBacked` for the Decorator chip. Kept as a
 * narrow shape so tests can build lightweight fixtures.
 */
export interface DerivableNodeAttributes {
  readonly nodeKind?: string;
  readonly symbolKind?: string;
  readonly decoratorBacked?: boolean;
}

/** The graph attributes the derivation reads off each edge. */
export interface DerivableEdgeAttributes {
  readonly edgeKind?: string;
}

/**
 * The membership inputs the derivation needs beyond the graph itself. This is
 * the subset of {@link GraphViewState} that affects *which* nodes/edges are in
 * the view, plus the precomputed depth-visible set (the BFS neighbourhood the
 * GraphView already computes from `depth` + the anchor selection).
 *
 * `depthVisibleNodeIds` is `null` when the depth filter is inactive (show all),
 * matching the existing `depthVisibleNodeIdsRef` contract.
 */
export interface VisibleViewInputs extends Pick<
  GraphViewState,
  "hiddenNodeKinds" | "hiddenEdgeKinds" | "depth" | "activeLensId" | "selectedNodeId"
> {
  readonly depthVisibleNodeIds: ReadonlySet<string> | null;
  readonly focusNodeId: string | null;
}

/**
 * The node-kind key a node is filtered by. Mirrors the reducer:
 * file nodes key on "file"; symbols key on their `symbolKind`, defaulting to
 * "function" when absent (the reducer's fallback).
 */
function nodeKindKey(attrs: DerivableNodeAttributes): string {
  return attrs.nodeKind === "file" ? "file" : (attrs.symbolKind ?? "function");
}

/**
 * Decide whether a node is a member of the visible view, applying the same three
 * hiding rules the Sigma node reducer applies (in the same order):
 * 1. its node-kind is hidden by the node-type filter;
 * 2. the Decorator chip is off and the node is decorator-backed;
 * 3. the depth filter is active and the node is outside the depth neighbourhood.
 */
function isNodeVisible(
  attrs: DerivableNodeAttributes,
  nodeId: string,
  inputs: VisibleViewInputs,
): boolean {
  if (inputs.hiddenNodeKinds.has(nodeKindKey(attrs))) {
    return false;
  }
  if (inputs.hiddenNodeKinds.has("decorator") && attrs.decoratorBacked === true) {
    return false;
  }
  if (inputs.depthVisibleNodeIds !== null && !inputs.depthVisibleNodeIds.has(nodeId)) {
    return false;
  }
  return true;
}

/**
 * Compute the {@link VisibleView} membership from the graph + the view-state
 * inputs. Pure: the same `(graph, inputs)` always yields an equivalent view.
 *
 * A node is a member when it survives the node-kind / decorator / depth filters.
 * An edge is a member when its kind is not hidden *and* both its endpoints are
 * members — an edge to a hidden node is not part of a coherent visible subgraph.
 */
export function deriveVisibleView(
  graph: MultiDirectedGraph,
  inputs: VisibleViewInputs,
): VisibleView {
  const nodeIds = new Set<string>();

  graph.forEachNode((nodeId, attributes) => {
    if (isNodeVisible(attributes as DerivableNodeAttributes, nodeId, inputs)) {
      nodeIds.add(nodeId);
    }
  });

  const edgeIds = new Set<string>();

  graph.forEachEdge((edgeId, attributes, source, target) => {
    const edgeAttrs = attributes as DerivableEdgeAttributes;
    if (
      edgeAttrs.edgeKind !== undefined &&
      inputs.hiddenEdgeKinds.has(edgeAttrs.edgeKind as never)
    ) {
      return;
    }
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      return;
    }
    edgeIds.add(edgeId);
  });

  return {
    nodeIds,
    edgeIds,
    activeLensId: inputs.activeLensId,
    hiddenNodeKinds: inputs.hiddenNodeKinds,
    hiddenEdgeKinds: inputs.hiddenEdgeKinds,
    depth: inputs.depth,
    focusNodeId: inputs.focusNodeId,
  };
}
