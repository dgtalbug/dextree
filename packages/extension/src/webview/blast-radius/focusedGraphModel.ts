import type { GraphEdge, GraphNode } from "@dextree/core";

import type { SelectionTraversal } from "../components/graphViewTypes.js";

/**
 * Framework-agnostic node/edge model for the focused (React Flow) view.
 *
 * This module is intentionally free of any `@xyflow/react` import so the "which
 * nodes, which edges, how bounded" logic is pure and unit-testable without the
 * React Flow runtime. `FocusedGraphView` maps these plain shapes onto React
 * Flow's `Node`/`Edge` types. Built entirely from data already in the webview —
 * the rendered graph plus a node's selection traversal — so no host round-trip.
 */

/** A boxed-card node in the focused view. `ring` is the BFS depth (0 = focus). */
export interface FocusedNode {
  id: string;
  label: string;
  nodeType: GraphNode["type"];
  symbolKind?: GraphNode["symbolKind"];
  importance: number;
  isCore: boolean;
  ring: number;
  /** True for the node the view is focused on (ring 0). */
  isFocus: boolean;
}

/** A routed edge in the focused view. Direction relative to the focus node. */
export interface FocusedEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdge["kind"];
  /** Relative to the focus node: an inbound edge is a caller, outbound a callee. */
  direction: "inbound" | "outbound" | "other";
}

export interface FocusedGraphModel {
  focusId: string;
  nodes: FocusedNode[];
  edges: FocusedEdge[];
  /** How many neighbourhood nodes were dropped by the top-N cap (0 if none). */
  truncatedCount: number;
}

/**
 * Max nodes the focused view renders before it stops being legible. The focus
 * node is always kept; the rest of the neighbourhood is ranked by importance and
 * the lowest-ranked overflow is dropped (and reported via `truncatedCount`).
 */
export const FOCUSED_VIEW_MAX_NODES = 60;

const importanceOf = (n: GraphNode): number =>
  typeof n.importance === "number" && Number.isFinite(n.importance) ? n.importance : 0;

/**
 * Build the focused model from the in-memory graph + a node's traversal.
 *
 * `traversal.nodeLayers` gives node ids by BFS depth (layer 0 = the focus node),
 * so a node's ring is its layer index. Nodes beyond the cap are dropped lowest-
 * importance-first (never the focus node); edges with a dropped endpoint are
 * dropped too.
 */
export function buildFocusedGraphModel(
  graphNodes: readonly GraphNode[],
  graphEdges: readonly GraphEdge[],
  traversal: SelectionTraversal,
  maxNodes: number = FOCUSED_VIEW_MAX_NODES,
): FocusedGraphModel {
  const focusId = traversal.selectedNodeId;
  const byId = new Map(graphNodes.map((n) => [n.id, n]));

  // Ring index per node id, from the BFS layers (layer 0 = focus).
  const ringOf = new Map<string, number>();
  traversal.nodeLayers.forEach((layer, ring) => {
    for (const id of layer) if (!ringOf.has(id)) ringOf.set(id, ring);
  });

  // Candidate focused nodes (those that exist in the live graph), focus first.
  const candidates: GraphNode[] = [];
  for (const id of traversal.nodeIds) {
    const node = byId.get(id);
    if (node !== undefined) candidates.push(node);
  }

  // Keep the focus node, then the most-important others up to the cap.
  const others = candidates
    .filter((n) => n.id !== focusId)
    .sort((a, b) => importanceOf(b) - importanceOf(a));
  const keptOthers = others.slice(0, Math.max(0, maxNodes - 1));
  const truncatedCount = others.length - keptOthers.length;

  const focusNode = byId.get(focusId);
  const kept: GraphNode[] = focusNode === undefined ? keptOthers : [focusNode, ...keptOthers];
  const keptIds = new Set(kept.map((n) => n.id));

  const nodes: FocusedNode[] = kept.map((n) => ({
    id: n.id,
    label: n.label,
    nodeType: n.type,
    ...(n.symbolKind === undefined ? {} : { symbolKind: n.symbolKind }),
    importance: importanceOf(n),
    isCore: n.isCore === true,
    ring: ringOf.get(n.id) ?? 0,
    isFocus: n.id === focusId,
  }));

  const edges: FocusedEdge[] = [];
  for (const edge of graphEdges) {
    if (!traversal.edgeIds.has(edge.id)) continue;
    if (!keptIds.has(edge.source) || !keptIds.has(edge.target)) continue; // dropped endpoint
    const direction: FocusedEdge["direction"] =
      edge.target === focusId ? "inbound" : edge.source === focusId ? "outbound" : "other";
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      direction,
    });
  }

  return { focusId, nodes, edges, truncatedCount };
}
