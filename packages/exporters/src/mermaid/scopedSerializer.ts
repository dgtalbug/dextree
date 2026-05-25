import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";

import { extractMermaidScope } from "./scope.js";
import { MERMAID_INIT_DIRECTIVE, type MermaidTheme } from "./theme.js";

export { extractMermaidScope };

/**
 * Discriminated union describing which portion of the indexed workspace graph
 * to export. Slice 027 ships `workspace` and `file`; `symbol-callers` /
 * `symbol-callees` are pre-declared so later slices add behavior without
 * changing the option type.
 */
export type MermaidScope =
  | { kind: "workspace" }
  | { kind: "file"; relativePath: string }
  | { kind: "symbol-callers"; symbolId: string; maxDepth?: number }
  | { kind: "symbol-callees"; symbolId: string; maxDepth?: number };

/** Bounded level of detail. `symbol` is the pass-through baseline. */
export type MermaidGranularity = "package" | "file" | "symbol";

/**
 * Flowchart orientation. `auto` resolves to a per-scope-shape default; the
 * other values map directly to Mermaid's `graph <DIR>` tokens.
 */
export type MermaidDirection = "auto" | "TB" | "LR" | "BT" | "RL";

/** Full option payload accepted by the scoped serializer. */
export interface ScopedMermaidOptions {
  scope: MermaidScope;
  granularity: MermaidGranularity;
  direction: MermaidDirection;
  theme: MermaidTheme;
}

/**
 * Result returned by `validateScopedMermaidExport`. The orchestrator throws
 * with `reason` on any non-ok status; consumers that want to handle empty /
 * oversized / unsupported cases gracefully should call the validator
 * themselves first.
 */
export type ScopedExportValidation =
  | { status: "ok"; nodeCount: number; edgeCount: number }
  | { status: "empty"; reason: string }
  | {
      status: "oversized";
      nodeCount: number;
      edgeCount: number;
      cap: { nodes: number; edges: number };
      reason: string;
    }
  | { status: "unsupported"; reason: string };

/**
 * Per-granularity export caps. File granularity tolerates the most because
 * each node is structurally lighter; package tolerates the fewest because
 * label collisions appear earliest at that level.
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
 * Result of scope extraction. Forward-compatibility seam: scope kinds not yet
 * implemented in this build return `unsupported` and the orchestrator
 * propagates that result without invoking the validator.
 */
export type ScopeExtractionResult =
  | { status: "ok"; subgraph: WorkspaceSubgraph }
  | { status: "unsupported"; reason: string };

// ---------------------------------------------------------------------------
// Pass-through implementations.
//
// US1 replaced extractMermaidScope via scope.ts (re-exported above).
// US2 (T016) replaces applyMermaidGranularity with file + package collapse.
// US3 (T021) replaces inferMermaidDirection with per-scope inference.
// US3 (T022) replaces validateScopedMermaidExport with real cap logic.
// ---------------------------------------------------------------------------

export function applyMermaidGranularity(
  subgraph: WorkspaceSubgraph,
  _granularity: MermaidGranularity,
): WorkspaceSubgraph {
  return subgraph;
}

export function inferMermaidDirection(_scope: MermaidScope): "TB" | "LR" | "BT" | "RL" {
  return "TB";
}

export function validateScopedMermaidExport(
  subgraph: WorkspaceSubgraph,
  _granularity: MermaidGranularity,
): ScopedExportValidation {
  return {
    status: "ok",
    nodeCount: subgraph.nodes.length,
    edgeCount: subgraph.edges.length,
  };
}

// ---------------------------------------------------------------------------
// Output formatting helpers. Mirror the slice-016 serializer.ts contract so
// the legacy shim and the new scoped path emit byte-identical node + edge
// lines (only the `graph <DIR>` header differs).
// ---------------------------------------------------------------------------

function toSafeId(id: string): string {
  return "n" + id.replace(/-/g, "_");
}

function escapeLabel(text: string): string {
  return text
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");
}

function nodeLabel(node: GraphNode): string {
  if (node.type === "symbol" && node.symbolKind !== undefined) {
    return `${escapeLabel(node.label)} [${node.symbolKind}]`;
  }
  return escapeLabel(node.label);
}

function emitMermaidLines(
  subgraph: WorkspaceSubgraph,
  direction: "TB" | "LR" | "BT" | "RL",
  theme: MermaidTheme,
): string {
  const lines: string[] = [];

  lines.push(MERMAID_INIT_DIRECTIVE[theme]);
  lines.push(`graph ${direction}`);

  const nodeIds = new Set(subgraph.nodes.map((n) => n.id));

  const sortedNodes = [...subgraph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of sortedNodes) {
    lines.push(`  ${toSafeId(node.id)}["${nodeLabel(node)}"]`);
  }

  const sortedEdges = [...subgraph.edges].sort((a: GraphEdge, b: GraphEdge) => {
    const keyA = `${a.source}\0${a.target}\0${a.kind}`;
    const keyB = `${b.source}\0${b.target}\0${b.kind}`;
    return keyA.localeCompare(keyB);
  });

  for (const edge of sortedEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    lines.push(`  ${toSafeId(edge.source)} -->|${edge.kind}| ${toSafeId(edge.target)}`);
  }

  return lines.join("\n");
}

/**
 * End-to-end scoped Mermaid serializer.
 *
 * Pipeline: extractMermaidScope → applyMermaidGranularity →
 * validateScopedMermaidExport → emit text.
 *
 * Pure: same `(subgraph, options)` always produces the same string. Throws
 * with `validation.reason` whenever extraction or validation returns a
 * non-ok status; callers that want graceful handling should call the
 * helpers themselves first.
 */
export function serializeToScopedMermaid(
  subgraph: WorkspaceSubgraph,
  options: ScopedMermaidOptions,
): string {
  const extracted = extractMermaidScope(subgraph, options.scope);
  if (extracted.status === "unsupported") {
    throw new Error(extracted.reason);
  }

  const collapsed = applyMermaidGranularity(extracted.subgraph, options.granularity);
  const validation = validateScopedMermaidExport(collapsed, options.granularity);
  if (validation.status !== "ok") {
    throw new Error(validation.reason);
  }

  const direction =
    options.direction === "auto" ? inferMermaidDirection(options.scope) : options.direction;

  return emitMermaidLines(collapsed, direction, options.theme);
}
