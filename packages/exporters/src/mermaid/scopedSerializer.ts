import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";

import { serializeToClassDiagram } from "./classDiagram.js";
import {
  serializeToSequenceDiagram,
  validateSequenceDiagramExport,
  type TraceSequenceSnapshot,
} from "./sequenceDiagram.js";
import { inferMermaidDirection } from "./direction.js";
import { applyMermaidGranularity, clampGranularityToScope } from "./granularity.js";
import { extractMermaidScope } from "./scope.js";
import { MERMAID_INIT_DIRECTIVE, type MermaidTheme } from "./theme.js";
import { MERMAID_GRANULARITY_CAPS, validateScopedMermaidExport } from "./validator.js";

export {
  applyMermaidGranularity,
  clampGranularityToScope,
  extractMermaidScope,
  inferMermaidDirection,
  MERMAID_GRANULARITY_CAPS,
  validateScopedMermaidExport,
};

/**
 * Bounded discriminator for the diagram shape produced by
 * {@link serializeToScopedMermaid}. `flowchart` is the default.
 */
export type MermaidDiagram = "flowchart" | "classDiagram" | "sequenceDiagram";

/**
 * Discriminated union describing which portion of the indexed workspace graph
 * to export. `workspace` and `file` are the original scopes; `visible` exports
 * an explicit node/edge id set (the rendered `VisibleView`, so an export matches
 * exactly what the user sees after lenses/filters/depth). `symbol-callers` /
 * `symbol-callees` are pre-declared so behavior can be added without
 * changing the option type.
 */
export type MermaidScope =
  | { kind: "workspace" }
  | { kind: "file"; relativePath: string }
  | { kind: "visible"; nodeIds: string[]; edgeIds: string[] }
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
  /**
   * The `classDiagram` branch delegates to
   * `serializeToClassDiagram` and ignores `granularity` (forced to `"symbol"`)
   * and `direction` (Mermaid classDiagram has no direction token).
   */
  diagram: MermaidDiagram;
  scope: MermaidScope;
  granularity: MermaidGranularity;
  direction: MermaidDirection;
  theme: MermaidTheme;
  /**
   * Required when `diagram === "sequenceDiagram"`. Holds the active webview
   * trace route the serializer turns into ordered participants and steps.
   * Ignored by the flowchart and classDiagram branches.
   * Callers that already validate the snapshot themselves may still pass it
   * here so `serializeToScopedMermaid` can re-validate and fail closed.
   */
  trace?: TraceSequenceSnapshot;
  /**
   * Opt out of the workspace granularity floor. User-facing export paths leave
   * this unset so a `workspace` scope never descends to `symbol` (see
   * {@link clampGranularityToScope}). The legacy `serializeToMermaid`
   * shim sets it `true` to preserve its byte-identical symbol-level output for
   * the snapshot/fuzz callers that predate the floor.
   */
  allowUnscopedSymbols?: boolean;
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
      // Above the soft cap but within the hard cap: the export proceeds, but the
      // result is flagged so the UI can surface a non-blocking "large diagram"
      // notice. The serializer still produces output for this status.
      status: "warning";
      nodeCount: number;
      edgeCount: number;
      cap: MermaidExportCap;
      reason: string;
    }
  | {
      status: "oversized";
      nodeCount: number;
      edgeCount: number;
      cap: MermaidExportCap;
      reason: string;
    }
  | { status: "unsupported"; reason: string };

/** Two-tier export cap: hard `nodes`/`edges` plus the `soft` warning thresholds. */
export interface MermaidExportCap {
  nodes: number;
  edges: number;
  soft: { nodes: number; edges: number };
}

/**
 * Result of scope extraction. Forward-compatibility seam: scope kinds not yet
 * implemented in this build return `unsupported` and the orchestrator
 * propagates that result without invoking the validator.
 */
export type ScopeExtractionResult =
  | { status: "ok"; subgraph: WorkspaceSubgraph }
  | { status: "unsupported"; reason: string };

// ---------------------------------------------------------------------------
// Per-axis behavior lives in scope.ts / granularity.ts / direction.ts /
// validator.ts — all re-exported above for consumers of @dextree/exporters.
// ---------------------------------------------------------------------------
// Output formatting helpers. Mirror the serializer.ts contract so
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
/**
 * Strategy contract for a Mermaid diagram type (RULE-ARCH-004). Each diagram is
 * one serializer; the registry below maps the diagram discriminator to its
 * strategy, so adding a diagram type is a registration, not a new switch arm.
 */
export interface SubgraphSerializer {
  serialize(subgraph: WorkspaceSubgraph, options: ScopedMermaidOptions): string;
}

const SERIALIZERS: Readonly<Record<MermaidDiagram, SubgraphSerializer>> = {
  flowchart: { serialize: serializeFlowchart },
  classDiagram: { serialize: serializeToClassDiagram },
  sequenceDiagram: { serialize: serializeSequence },
};

export function serializeToScopedMermaid(
  subgraph: WorkspaceSubgraph,
  options: ScopedMermaidOptions,
): string {
  const serializer = SERIALIZERS[options.diagram];
  if (serializer === undefined) {
    throw new Error(`No Mermaid serializer registered for diagram type '${options.diagram}'`);
  }
  return serializer.serialize(subgraph, options);
}

/**
 * Typed, non-throwing variant of {@link serializeToScopedMermaid}. Returns the
 * validation outcome as data alongside the source, so callers (the preview
 * router) can branch on `validation.status` instead of catching an Error and
 * regex-matching its message, and read the soft-cap `warning` without re-running
 * the pipeline. `source` is non-null exactly when `validation.status` is `ok` or
 * `warning`; it is null for `empty` / `oversized` / `unsupported`.
 */
export interface ScopedMermaidResult {
  source: string | null;
  validation: ScopedExportValidation;
}

export function serializeScopedMermaidResult(
  subgraph: WorkspaceSubgraph,
  options: ScopedMermaidOptions,
): ScopedMermaidResult {
  if (options.diagram === "flowchart") {
    return serializeFlowchartResult(subgraph, options);
  }
  // classDiagram / sequenceDiagram have no soft-cap node path; surface their
  // blocking failures as a typed validation rather than a thrown Error. Their
  // failures are empty-scope or unsupported (both `{status, reason}` shapes) —
  // never the cap-bearing `oversized`.
  try {
    return { source: SERIALIZERS[options.diagram].serialize(subgraph, options), validation: OK };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const status: "empty" | "unsupported" = /zero nodes|empty/i.test(reason)
      ? "empty"
      : "unsupported";
    return { source: null, validation: { status, reason } };
  }
}

const OK: ScopedExportValidation = { status: "ok", nodeCount: 0, edgeCount: 0 };

function serializeSequence(subgraph: WorkspaceSubgraph, options: ScopedMermaidOptions): string {
  if (!options.trace) {
    throw new Error(
      "sequenceDiagram export requires an active trace snapshot in ScopedMermaidOptions.trace.",
    );
  }
  const validation = validateSequenceDiagramExport(subgraph, options.trace);
  if (validation.status !== "ok") {
    throw new Error(validation.reason);
  }
  return serializeToSequenceDiagram(subgraph, options.trace, options);
}

function serializeFlowchart(subgraph: WorkspaceSubgraph, options: ScopedMermaidOptions): string {
  const result = serializeFlowchartResult(subgraph, options);
  if (result.source === null) {
    throw new Error(
      "reason" in result.validation ? result.validation.reason : "flowchart export failed",
    );
  }
  return result.source;
}

/**
 * Flowchart serialization computing its validation once and returning it with the
 * source. The throwing {@link serializeFlowchart} is a thin wrapper over this.
 */
function serializeFlowchartResult(
  subgraph: WorkspaceSubgraph,
  options: ScopedMermaidOptions,
): ScopedMermaidResult {
  const extracted = extractMermaidScope(subgraph, options.scope);
  if (extracted.status === "unsupported") {
    return { source: null, validation: { status: "unsupported", reason: extracted.reason } };
  }

  const granularity = options.allowUnscopedSymbols
    ? options.granularity
    : clampGranularityToScope(options.scope, options.granularity);

  const collapsed = applyMermaidGranularity(extracted.subgraph, granularity);
  const validation = validateScopedMermaidExport(collapsed, granularity);
  // `warning` is above the soft cap but within the hard cap: serialize anyway
  // (the UI surfaces the non-blocking notice). Only empty / oversized /
  // unsupported block the export.
  if (validation.status !== "ok" && validation.status !== "warning") {
    return { source: null, validation };
  }

  const direction =
    options.direction === "auto" ? inferMermaidDirection(options.scope) : options.direction;

  return { source: emitMermaidLines(collapsed, direction, options.theme), validation };
}
