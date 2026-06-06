import type { WorkspaceSubgraph } from "@dextree/core";

import type { MermaidGranularity, ScopedExportValidation } from "./scopedSerializer.js";

/**
 * Per-granularity export caps. Two tiers per dimension:
 *
 *  - `soft` — beyond this the diagram is still exported but the result is
 *    flagged `warning` so the UI can surface a non-blocking "large diagram"
 *    notice (the slice-033 status-bar "soft cap").
 *  - `hard` — beyond this the export is refused (`oversized`); the diagram is
 *    too dense to be legible.
 *
 * File granularity tolerates the most because each node is structurally
 * lighter; package the fewest because label collisions appear earliest. Tune
 * in one place. `nodes`/`edges` mirror the hard cap so existing callers that
 * read `.nodes`/`.edges` keep working.
 */
export const MERMAID_GRANULARITY_CAPS: Record<
  MermaidGranularity,
  { nodes: number; edges: number; soft: { nodes: number; edges: number } }
> = {
  package: { nodes: 150, edges: 300, soft: { nodes: 75, edges: 150 } },
  file: { nodes: 400, edges: 800, soft: { nodes: 200, edges: 400 } },
  symbol: { nodes: 200, edges: 400, soft: { nodes: 100, edges: 200 } },
};

/**
 * Fail-closed pre-write validation for a scoped Mermaid export. Runs after
 * scope extraction + granularity collapse, before serialisation. The
 * orchestrator throws with `reason` on any non-ok status, so a serialised
 * `.mmd` file is only ever produced for an `ok` graph.
 *
 * `empty` covers the post-collapse zero-node case. `oversized` quotes both
 * the actual count and the breached cap so consumer UX can offer concrete
 * narrowing guidance. `unsupported` is the responsibility of
 * extractMermaidScope; the validator only sees a successfully-extracted
 * subgraph.
 */
export function validateScopedMermaidExport(
  subgraph: WorkspaceSubgraph,
  granularity: MermaidGranularity,
): ScopedExportValidation {
  const nodeCount = subgraph.nodes.length;
  const edgeCount = subgraph.edges.length;

  if (nodeCount === 0) {
    return {
      status: "empty",
      reason: "Scope resolved to zero nodes; pick a wider scope.",
    };
  }

  const cap = MERMAID_GRANULARITY_CAPS[granularity];

  // Hard cap — refuse: the diagram would be illegible.
  if (nodeCount > cap.nodes) {
    return {
      status: "oversized",
      nodeCount,
      edgeCount,
      cap,
      reason: `Scoped graph has ${nodeCount} nodes which exceeds the ${granularity} cap of ${cap.nodes} nodes; pick a coarser granularity or narrower scope.`,
    };
  }

  if (edgeCount > cap.edges) {
    return {
      status: "oversized",
      nodeCount,
      edgeCount,
      cap,
      reason: `Scoped graph has ${edgeCount} edges which exceeds the ${granularity} cap of ${cap.edges} edges; pick a coarser granularity or narrower scope.`,
    };
  }

  // Soft cap — allow, but flag so the UI can warn the diagram is large.
  if (nodeCount > cap.soft.nodes || edgeCount > cap.soft.edges) {
    return {
      status: "warning",
      nodeCount,
      edgeCount,
      cap,
      reason: `Scoped graph has ${nodeCount} nodes / ${edgeCount} edges, above the ${granularity} soft cap (${cap.soft.nodes} nodes / ${cap.soft.edges} edges); the diagram may be dense. Narrow the scope for a cleaner result.`,
    };
  }

  return { status: "ok", nodeCount, edgeCount };
}
