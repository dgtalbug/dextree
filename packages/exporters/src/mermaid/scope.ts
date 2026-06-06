import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";
import { subgraph } from "graphology-operators";

import type { MermaidScope, ScopeExtractionResult } from "./scopedSerializer.js";

/**
 * Extract the focused subgraph for a Mermaid export scope.
 *
 * Pure: same `(workspaceSubgraph, scope)` always returns the same result.
 * Workspace returns identity. File runs `graphology-operators.subgraph()`
 * over the node ids whose `filePath` matches the scope's `relativePath`.
 * The two symbol scopes are pre-declared on `MermaidScope` for forward
 * compatibility and return `unsupported` until a later slice implements
 * their BFS-based extraction.
 */
export function extractMermaidScope(
  workspaceSubgraph: WorkspaceSubgraph,
  scope: MermaidScope,
): ScopeExtractionResult {
  switch (scope.kind) {
    case "workspace":
      return { status: "ok", subgraph: workspaceSubgraph };

    case "file":
      return extractFileScope(workspaceSubgraph, scope.relativePath);

    case "visible":
      return extractVisibleScope(workspaceSubgraph, scope.nodeIds, scope.edgeIds);

    case "symbol-callers":
    case "symbol-callees":
      return {
        status: "unsupported",
        reason: `Scope kind not implemented in this build: ${scope.kind}`,
      };
  }
}

function extractFileScope(
  workspaceSubgraph: WorkspaceSubgraph,
  relativePath: string,
): ScopeExtractionResult {
  // Suffix match handles both stored shapes: GraphNode.filePath may be an
  // absolute workspace path (e.g. "/workspace/src/foo.ts") or already a
  // relative path. A trailing "/" guard avoids "/src/foo.ts" matching
  // "src/oo.ts".
  const matches = (filePath: string): boolean =>
    filePath === relativePath || filePath.endsWith(`/${relativePath}`);

  const matchedIds = new Set<string>();
  for (const node of workspaceSubgraph.nodes) {
    if (matches(node.filePath)) {
      matchedIds.add(node.id);
    }
  }

  if (matchedIds.size === 0) {
    return {
      status: "unsupported",
      reason: `File not found in indexed graph: ${relativePath}`,
    };
  }

  const materialized = materializeGraphology(workspaceSubgraph);
  const scoped = subgraph(materialized, matchedIds);

  return {
    status: "ok",
    subgraph: serializeFromGraphology(scoped, workspaceSubgraph.frameworks),
  };
}

/**
 * Extract the rendered `VisibleView`: the induced subgraph over an explicit node
 * id set, then restricted to the explicit edge id set. Node induction keeps only
 * edges with both endpoints visible; intersecting with `edgeIds` additionally
 * honors edge-kind hiding (a CALLS edge between two visible nodes can still be
 * hidden by the edge filter, so it must not reappear in the export). Unknown ids
 * are ignored. An empty visible set yields an empty subgraph (never throws), so
 * the export always matches exactly what is on screen.
 */
function extractVisibleScope(
  workspaceSubgraph: WorkspaceSubgraph,
  nodeIds: string[],
  edgeIds: string[],
): ScopeExtractionResult {
  const visibleNodeIds = new Set(nodeIds);
  const present = new Set<string>();
  for (const node of workspaceSubgraph.nodes) {
    if (visibleNodeIds.has(node.id)) {
      present.add(node.id);
    }
  }

  const materialized = materializeGraphology(workspaceSubgraph);
  const scoped = subgraph(materialized, present);

  // Restrict induced edges to the explicit visible edge set so edge-kind hiding
  // is honored. An empty edgeIds with non-empty nodes keeps no edges.
  const visibleEdgeIds = new Set(edgeIds);
  scoped.forEachEdge((edgeKey) => {
    if (!visibleEdgeIds.has(edgeKey)) {
      scoped.dropEdge(edgeKey);
    }
  });

  return {
    status: "ok",
    subgraph: serializeFromGraphology(scoped, workspaceSubgraph.frameworks),
  };
}

function materializeGraphology(
  workspaceSubgraph: WorkspaceSubgraph,
): MultiDirectedGraph<GraphNode, GraphEdge> {
  const graph = new MultiDirectedGraph<GraphNode, GraphEdge>();

  for (const node of workspaceSubgraph.nodes) {
    if (!graph.hasNode(node.id)) {
      graph.addNode(node.id, node);
    }
  }

  for (const edge of workspaceSubgraph.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }
    if (graph.hasEdge(edge.id)) {
      continue;
    }
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, edge);
  }

  return graph;
}

function serializeFromGraphology(
  graph: MultiDirectedGraph<GraphNode, GraphEdge>,
  frameworks: WorkspaceSubgraph["frameworks"],
): WorkspaceSubgraph {
  const nodes: GraphNode[] = [];
  graph.forEachNode((_id, attrs) => {
    nodes.push(attrs);
  });

  const edges: GraphEdge[] = [];
  graph.forEachEdge((_id, attrs) => {
    edges.push(attrs);
  });

  return { nodes, edges, frameworks };
}
