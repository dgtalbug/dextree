/**
 * Shell layout constants (slice 033).
 *
 * Single source of truth for the grid templates the mockup pins
 * (scratch/graphview-mockup-final.html). The CSS Modules that own the actual
 * layout reference the same literal values; these constants exist so tests can
 * assert against one canonical definition and so any future tweak changes one
 * place. They are deliberately `as const` string templates matching the CSS
 * `grid-template-*` syntax exactly.
 */

/** GraphView + Trace shell columns: left rail / canvas / right rail. */
export const SHELL_COLUMNS = "260px 1fr 320px" as const;

/** GraphView + Trace shell rows: toolbar / body / status bar. */
export const SHELL_ROWS = "44px 1fr 28px" as const;

/** Mermaid preview shell rows: toolbar / status / body / export bar. */
export const MERMAID_ROWS = "44px 44px 1fr 56px" as const;

/** Mermaid body split: rendered diagram (2fr) / source text (1fr). */
export const MERMAID_BODY_COLUMNS = "2fr 1fr" as const;

/** Editor-style tab strip height, in pixels. */
export const TAB_STRIP_HEIGHT = 32 as const;

/** Minimum width of a workspace card before the responsive grid wraps. */
export const WORKSPACES_CARD_MIN_WIDTH = "320px" as const;

/** Responsive workspaces card grid template. */
export const WORKSPACES_GRID_COLUMNS =
  `repeat(auto-fill, minmax(${WORKSPACES_CARD_MIN_WIDTH}, 1fr))` as const;
