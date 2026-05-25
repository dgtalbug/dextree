import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";

import type { MermaidGranularity } from "./scopedSerializer.js";

/**
 * Collapse a scoped subgraph to the requested granularity.
 *
 * Pure: same `(subgraph, granularity)` always returns the same result.
 * `symbol` is the pass-through baseline. `file` folds every symbol node
 * into its parent file (by shared `filePath`), drops resulting self-edges,
 * and deduplicates parallel edges. `package` further folds files into
 * their detected package (`packages/<name>/...` segment, else the
 * immediate parent directory).
 */
export function applyMermaidGranularity(
  subgraph: WorkspaceSubgraph,
  granularity: MermaidGranularity,
): WorkspaceSubgraph {
  switch (granularity) {
    case "symbol":
      return subgraph;
    case "file":
      return collapseToFile(subgraph);
    case "package":
      return collapseToPackage(subgraph);
  }
}

// ---------------------------------------------------------------------------
// file granularity
// ---------------------------------------------------------------------------

function collapseToFile(subgraph: WorkspaceSubgraph): WorkspaceSubgraph {
  // Build filePath → file-node-id index. The first file node wins on
  // filePath collisions (shouldn't happen in practice — filePath is unique
  // per indexed file row).
  const fileByPath = new Map<string, string>();
  for (const node of subgraph.nodes) {
    if (node.type === "file" && !fileByPath.has(node.filePath)) {
      fileByPath.set(node.filePath, node.id);
    }
  }

  // Map every node id (file or symbol) to the file id it should collapse
  // into. Symbols whose parent file isn't in the input subgraph are
  // dropped — there is no file node to fold them into.
  const remap = new Map<string, string>();
  for (const node of subgraph.nodes) {
    if (node.type === "file") {
      remap.set(node.id, node.id);
    } else {
      const parentId = fileByPath.get(node.filePath);
      if (parentId !== undefined) {
        remap.set(node.id, parentId);
      }
    }
  }

  // Result nodes: every file node from input. Orphan files (no symbol
  // children) are preserved by construction.
  const nodes: GraphNode[] = subgraph.nodes.filter((n) => n.type === "file");

  const edges = remapAndDedupEdges(subgraph.edges, remap);

  return { nodes, edges, frameworks: subgraph.frameworks };
}

// ---------------------------------------------------------------------------
// package granularity
// ---------------------------------------------------------------------------

function collapseToPackage(subgraph: WorkspaceSubgraph): WorkspaceSubgraph {
  // Each input node maps to a synthetic package node. Files contribute
  // their detected package directly; symbols contribute via their parent
  // file's package (computed from the symbol's own filePath since it
  // matches the file's filePath in the indexed graph).
  const remap = new Map<string, string>();
  const packageLabel = new Map<string, string>();

  for (const node of subgraph.nodes) {
    const pkg = packageOf(node.filePath);
    const synthId = `pkg:${pkg}`;
    remap.set(node.id, synthId);
    if (!packageLabel.has(synthId)) {
      packageLabel.set(synthId, pkg);
    }
  }

  // Build one synthetic file node per package. Use a stable filePath of
  // `package://<name>` so downstream consumers (mermaid emitter, fuzz
  // target) never observe a duplicate filePath.
  const nodes: GraphNode[] = [];
  for (const [synthId, pkg] of packageLabel) {
    nodes.push({
      id: synthId,
      type: "file",
      label: pkg,
      filePath: `package://${pkg}`,
      startLine: 1,
    });
  }

  const edges = remapAndDedupEdges(subgraph.edges, remap);

  return { nodes, edges, frameworks: subgraph.frameworks };
}

function packageOf(filePath: string): string {
  // Monorepo convention: `.../packages/<name>/...` → `<name>`.
  const monorepoMatch = filePath.match(/\/packages\/([^/]+)\//);
  if (monorepoMatch?.[1]) {
    return monorepoMatch[1];
  }

  // Otherwise group by the immediate parent directory basename. For a
  // file at the workspace root that yields the workspace folder name,
  // which is acceptable as a coarsest grouping.
  const parts = filePath.split("/").filter((s) => s.length > 0);
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent !== undefined && parent.length > 0) {
      return parent;
    }
  }
  return "(root)";
}

// ---------------------------------------------------------------------------
// Shared edge remap + dedup
// ---------------------------------------------------------------------------

function remapAndDedupEdges(
  edges: readonly GraphEdge[],
  remap: ReadonlyMap<string, string>,
): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];

  for (const edge of edges) {
    const source = remap.get(edge.source);
    const target = remap.get(edge.target);
    if (source === undefined || target === undefined) {
      continue;
    }
    if (source === target) {
      // Self-edge introduced by the collapse — drop. DEFINES (file → symbol)
      // becomes file → file === self after symbol fold.
      continue;
    }
    const dedupKey = `${source}\0${target}\0${edge.kind}`;
    if (seen.has(dedupKey)) {
      continue;
    }
    seen.add(dedupKey);
    out.push({
      id: edge.id,
      source,
      target,
      kind: edge.kind,
    });
  }

  return out;
}
