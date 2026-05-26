import type { WorkspaceSubgraph } from "@dextree/core";

import { serializeToScopedMermaid } from "./scopedSerializer.js";
import type { MermaidDirection, MermaidGranularity, MermaidScope } from "./scopedSerializer.js";
import { MERMAID_INIT_DIRECTIVE } from "./theme.js";

/**
 * Bounded diagram kind for the preview tab. `flowchart` and `classDiagram`
 * are routable in slice 029; `sequenceDiagram` is reserved for slice 031 and
 * routes to an explicit `unsupported` result.
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
  const scopeLabel =
    options.scope.kind === "workspace"
      ? "Workspace"
      : options.scope.kind === "file"
        ? `File · ${options.scope.relativePath}`
        : options.scope.kind === "symbol-callers"
          ? `Callers · ${options.scope.symbolId}`
          : `Callees · ${options.scope.symbolId}`;
  return `${options.diagram} · ${scopeLabel}`;
}

/**
 * Pure preview router. Builds the Mermaid source text for the requested
 * diagram + scope combination by delegating to the slice-027 scoped
 * serializer (and, in PR-B, the slice-028 class-diagram serializer). Never
 * performs filesystem, DOM, or network work.
 *
 * Errors raised by the underlying serializer (empty / oversized / unsupported
 * scope) are caught and returned as fail-closed `MermaidPreviewResult`
 * variants so callers can render the failure reason without try/catch noise.
 *
 * Slice 029 PR-A ships the `flowchart` route. `classDiagram` and
 * `sequenceDiagram` are recognised but return explicit `unsupported` until
 * the follow-up PR adds them.
 */
export function generateMermaidPreview(
  subgraph: WorkspaceSubgraph,
  options: MermaidPreviewOptions,
): MermaidPreviewResult {
  if (options.diagram === "sequenceDiagram") {
    return {
      status: "unsupported",
      options,
      reason: "Sequence preview is unavailable until slice 031.",
    };
  }

  if (options.diagram === "classDiagram") {
    return {
      status: "unsupported",
      options,
      reason: "Class-diagram preview lands in slice 029 PR-B (US2 inline-controls).",
    };
  }

  try {
    const source = serializeToScopedMermaid(subgraph, {
      diagram: "flowchart",
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
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const status = classifyFailure(reason);
    return { status, options, reason };
  }
}

function classifyFailure(reason: string): "empty" | "oversized" | "unsupported" {
  if (/zero nodes|empty/i.test(reason)) return "empty";
  if (/exceeds|oversized|cap/i.test(reason)) return "oversized";
  return "unsupported";
}

// Re-exported so consumers (the extension command + webview render path) can
// build a directive matching the resolved theme without re-deriving the map.
export { MERMAID_INIT_DIRECTIVE };
