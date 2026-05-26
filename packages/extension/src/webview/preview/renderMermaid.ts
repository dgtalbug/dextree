import type { MermaidPreviewTheme } from "@dextree/exporters";

export type MermaidRenderState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "ok"; svg: string }
  | { status: "render-error"; source: string; reason: string };

/**
 * Structural shape of the DOM `body` element this resolver needs. Typed
 * structurally (not as `HTMLElement`) so the file can be linted under the
 * non-webview eslint scope without depending on DOM globals; callers in
 * the webview pass `document.body` directly.
 */
export interface ThemeKindBody {
  dataset: Record<string, string | undefined>;
}

/**
 * Resolves the active VS Code theme kind to the bounded `MermaidPreviewTheme`
 * required by `generateMermaidPreview`. Mapping per slice 029 data-model:
 *
 *   - `light` / `hc-light` → `"light"`
 *   - `dark` / `hc-dark` → `"dark"`
 *
 * The VS Code theme kind is exposed on the body element via the
 * `data-vscode-theme-kind` attribute that the host injects (e.g.
 * `vscode-light`, `vscode-dark`, `vscode-high-contrast-light`).
 */
export function resolveMermaidThemeFromBody(body: ThemeKindBody): MermaidPreviewTheme {
  const kind = body.dataset["vscodeThemeKind"] ?? "";
  if (kind.includes("dark") && !kind.includes("light")) return "dark";
  return "light";
}

/**
 * Webview-side adapter over the Mermaid runtime. Lazily imports
 * `mermaid` so the runtime cost is paid only when the preview scene
 * actually mounts (the rest of the webview never touches the dep).
 *
 * Returns the rendered SVG markup on success and a `render-error`
 * payload on failure so the preview tab can keep the source visible
 * while replacing the rendered pane with an explicit reason.
 */
export async function renderMermaidSource(
  source: string,
  theme: MermaidPreviewTheme,
  containerId = "dxt-mermaid-preview",
): Promise<MermaidRenderState> {
  if (source.length === 0) {
    return { status: "render-error", source, reason: "Empty source." };
  }
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "strict",
      flowchart: { useMaxWidth: true },
      class: { useMaxWidth: true },
    });
    const { svg } = await mermaid.render(containerId, source);
    return { status: "ok", svg };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "render-error", source, reason };
  }
}
