import type { WorkspaceSubgraph } from "@dextree/core";

import type { MermaidGranularity, ScopedExportValidation } from "./scopedSerializer.js";

/**
 * Per-granularity export caps. File granularity tolerates the most because
 * each node is structurally lighter; package tolerates the fewest because
 * label collisions appear earliest at that level. Tune in one place.
 */
export const MERMAID_GRANULARITY_CAPS: Record<
  MermaidGranularity,
  { nodes: number; edges: number }
> = {
  package: { nodes: 150, edges: 300 },
  file: { nodes: 400, edges: 800 },
  symbol: { nodes: 200, edges: 400 },
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

  return { status: "ok", nodeCount, edgeCount };
}
