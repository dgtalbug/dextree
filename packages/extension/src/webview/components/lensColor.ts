/**
 * Alpha multiplier applied to non-matching nodes when a lens is active.
 * Spec target: ≤ 50% of base opacity (FR-005). 0.35 gives clearer visual
 * separation than 0.5 while still letting users see the dimmed structure.
 */
export const LENS_DIM_ALPHA = 0.35;

/**
 * Returns a CSS color string with reduced alpha for lens dimming.
 * Accepts hex (#rgb / #rrggbb), `rgb(...)`, `rgba(...)`. Unknown formats
 * fall through unchanged so Sigma renders the node at its base color.
 */
export function dimColor(color: string): string {
  if (color.startsWith("rgba(")) {
    return color.replace(/[\d.]+\s*\)$/, `${LENS_DIM_ALPHA})`);
  }
  if (color.startsWith("rgb(")) {
    return color.replace(/^rgb\(/, "rgba(").replace(/\)$/, `, ${LENS_DIM_ALPHA})`);
  }
  if (color.startsWith("#") && (color.length === 4 || color.length === 7)) {
    const hex =
      color.length === 4
        ? color
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("")
        : color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return color;
    }
    return `rgba(${r}, ${g}, ${b}, ${LENS_DIM_ALPHA})`;
  }
  return color;
}

/**
 * Per-layer node colours for the architecture lens. VS Code chart tokens only
 * (theme-aware; CLAUDE.md bans hardcoded hex in webview styles). The fallback
 * hex inside each `var()` is the last-resort default if the token is undefined,
 * mirroring the edge-palette pattern in `EdgeTypesPanel`.
 */
export const LAYER_COLORS: Readonly<Record<string, string>> = {
  presentation: "var(--vscode-charts-blue, #3794ff)",
  application: "var(--vscode-charts-purple, #c586c0)",
  domain: "var(--vscode-charts-green, #4ec9b0)",
  infrastructure: "var(--vscode-charts-orange, #ce9178)",
  test: "var(--vscode-charts-yellow, #dcdcaa)",
};

/**
 * Resolve a node's architecture-lens colour from its `archLayer`. Returns
 * `null` for `unknown` / unclassified / absent layers so the caller keeps the
 * node's base colour — honest about "we don't know this node's layer" rather
 * than inventing a colour for it.
 */
export function layerColor(archLayer: string | undefined): string | null {
  if (archLayer === undefined) {
    return null;
  }
  return LAYER_COLORS[archLayer] ?? null;
}
