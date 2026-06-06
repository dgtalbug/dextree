import type { Logger, WorkspaceSubgraph } from "@dextree/core";

import {
  applyMermaidGranularity,
  clampGranularityToScope,
  extractMermaidScope,
  serializeToScopedMermaid,
  validateScopedMermaidExport,
} from "./scopedSerializer.js";
import type { MermaidDirection, MermaidGranularity, MermaidScope } from "./scopedSerializer.js";
import { MERMAID_INIT_DIRECTIVE } from "./theme.js";

/**
 * Bounded diagram kind for the preview tab. `flowchart` and `classDiagram`
 * are routable since slice 029 PR-B; `sequenceDiagram` stays explicit
 * `unsupported` until slice 031 ships the sequence serializer.
 */
export type MermaidDiagramKind = "flowchart" | "classDiagram" | "sequenceDiagram";

/**
 * Resolved preview theme. Derived from the active VS Code theme by the
 * webview before each preview request and threaded through the router so
 * repeat preview behavior stays deterministic for the same inputs.
 */
export type MermaidPreviewTheme = "light" | "dark";

/**
 * Full option payload for {@link generateMermaidPreview}. Mirrors the
 * slice-027 scoped serializer surface and adds the diagram discriminator
 * and resolved theme used by the preview tab.
 */
export interface MermaidPreviewOptions {
  scope: MermaidScope;
  granularity: MermaidGranularity;
  diagram: MermaidDiagramKind;
  direction: MermaidDirection;
  theme: MermaidPreviewTheme;
}

/**
 * Host-side outcome of building a preview source. `ok` is the only status
 * that carries source text; the failure shapes preserve the requested
 * options so the webview can re-render the controls without losing state.
 */
export type MermaidPreviewResult =
  | {
      status: "ok";
      options: MermaidPreviewOptions;
      source: string;
      title: string;
      /**
       * Non-blocking "large diagram" notice when the export is above the soft
       * cap but within the hard cap. Present only in that case; the source is
       * still valid and rendered.
       */
      warning?: string;
    }
  | {
      status: "empty" | "oversized" | "unsupported";
      options: MermaidPreviewOptions;
      reason: string;
    };

const SCOPED_THEME_BY_PREVIEW_THEME = {
  light: "Light",
  dark: "Dark",
} as const;

function titleForOptions(options: MermaidPreviewOptions): string {
  const { scope } = options;
  let scopeLabel: string;
  switch (scope.kind) {
    case "workspace":
      scopeLabel = "Workspace";
      break;
    case "file":
      scopeLabel = `File · ${scope.relativePath}`;
      break;
    case "visible": {
      const count = scope.nodeIds.length;
      scopeLabel = `Current view · ${count} ${count === 1 ? "node" : "nodes"}`;
      break;
    }
    case "symbol-callers":
      scopeLabel = `Callers · ${scope.symbolId}`;
      break;
    case "symbol-callees":
      scopeLabel = `Callees · ${scope.symbolId}`;
      break;
  }
  return `${options.diagram} · ${scopeLabel}`;
}

/**
 * Pure preview router. Builds the Mermaid source text for the requested
 * diagram + scope combination by delegating to the slice-027 scoped flowchart
 * serializer or the slice-028 class-diagram serializer. Never performs
 * filesystem, DOM, or network work.
 *
 * Errors raised by the underlying serializer (empty / oversized / unsupported
 * scope) are caught and returned as fail-closed `MermaidPreviewResult`
 * variants so callers can render the failure reason without try/catch noise.
 *
 * `sequenceDiagram` is recognised but returns explicit `unsupported` until
 * slice 031 ships the sequence serializer.
 */
export function generateMermaidPreview(
  subgraph: WorkspaceSubgraph,
  options: MermaidPreviewOptions,
  logger?: Logger,
): MermaidPreviewResult {
  if (options.diagram === "sequenceDiagram") {
    return {
      status: "unsupported",
      options,
      reason: "Sequence preview is unavailable until slice 031.",
    };
  }

  try {
    const source = serializeToScopedMermaid(subgraph, {
      diagram: options.diagram,
      scope: options.scope,
      granularity: options.granularity,
      direction: options.direction,
      theme: SCOPED_THEME_BY_PREVIEW_THEME[options.theme],
    });
    return {
      status: "ok",
      options,
      source,
      title: titleForOptions(options),
      ...(softCapWarning(subgraph, options) ?? {}),
    };
  } catch (err) {
    logger?.error("generateMermaidPreview failed", err, {
      options: options as unknown as Record<string, unknown>,
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
    });
    const reason = err instanceof Error ? err.message : String(err);
    const status = classifyFailure(reason);
    return { status, options, reason };
  }
}

/**
 * Detect the soft-cap `warning` for a successful flowchart preview by re-running
 * the (pure) extract → collapse → validate pipeline. Returns `{ warning }` when
 * the export is above the soft cap (but within the hard cap, else it would have
 * thrown), or null otherwise. ClassDiagram has no node-cap path, so it never
 * warns here.
 */
function softCapWarning(
  subgraph: WorkspaceSubgraph,
  options: MermaidPreviewOptions,
): { warning: string } | null {
  if (options.diagram !== "flowchart") {
    return null;
  }
  const extracted = extractMermaidScope(subgraph, options.scope);
  if (extracted.status !== "ok") {
    return null;
  }
  const granularity = clampGranularityToScope(options.scope, options.granularity);
  const collapsed = applyMermaidGranularity(extracted.subgraph, granularity);
  const validation = validateScopedMermaidExport(collapsed, granularity);
  return validation.status === "warning" ? { warning: validation.reason } : null;
}

function classifyFailure(reason: string): "empty" | "oversized" | "unsupported" {
  if (/zero nodes|empty/i.test(reason)) return "empty";
  if (/exceeds|oversized|cap/i.test(reason)) return "oversized";
  return "unsupported";
}

// Re-exported so consumers (the extension command + webview render path) can
// build a directive matching the resolved theme without re-deriving the map.
export { MERMAID_INIT_DIRECTIVE };
