import styles from "./EdgeTypesPanel.module.css";

interface EdgeKindMeta {
  label: string;
  codicon: string;
  /**
   * Dot color for the kind. The `--edge-color-<kind>` custom property is not
   * defined globally, so each entry carries a `--vscode-charts-*` fallback;
   * without it the dot renders colorless. Mirrors the mockup's per-kind edge
   * palette in scratch/graphview-mockup-final.html.
   */
  dotColor: string;
}

const EDGE_KIND_META: Readonly<Record<string, EdgeKindMeta>> = {
  DEFINES: {
    label: "Defines",
    codicon: "symbol-file",
    dotColor: "var(--edge-color-defines, var(--vscode-charts-blue, #3794ff))",
  },
  IMPORTS: {
    label: "Imports",
    codicon: "arrow-swap",
    dotColor: "var(--edge-color-imports, var(--vscode-charts-green, #4ec9b0))",
  },
  CALLS: {
    label: "Calls",
    codicon: "symbol-function",
    dotColor: "var(--edge-color-calls, var(--vscode-charts-orange, #ce9178))",
  },
  EXTENDS: {
    label: "Extends",
    codicon: "symbol-class",
    dotColor: "var(--edge-color-extends, var(--vscode-charts-purple, #c586c0))",
  },
  INHERITS: {
    label: "Extends",
    codicon: "symbol-class",
    dotColor: "var(--edge-color-inherits, var(--vscode-charts-purple, #c586c0))",
  },
  IMPLEMENTS: {
    label: "Implements",
    codicon: "symbol-interface",
    dotColor: "var(--edge-color-implements, var(--vscode-charts-yellow, #dcdcaa))",
  },
  INSTANTIATES: {
    label: "New",
    codicon: "symbol-misc",
    dotColor: "var(--edge-color-instantiates, var(--vscode-charts-red, #f44747))",
  },
};

const DEFAULT_EDGE_DOT_COLOR = "var(--edge-color-default, var(--vscode-foreground, #cccccc))";

export interface EdgeTypeEntry {
  kind: string;
  label: string;
  count: number;
  disabled?: boolean;
  tooltip?: string;
}

export interface EdgeTypesPanelProps {
  entries: EdgeTypeEntry[];
  hiddenKinds: Set<string>;
  onToggle: (kind: string) => void;
}

export function EdgeTypesPanel({ entries, hiddenKinds, onToggle }: EdgeTypesPanelProps) {
  const activeEntries = entries.filter((e) => !e.disabled);
  const allHidden = activeEntries.length > 0 && activeEntries.every((e) => hiddenKinds.has(e.kind));

  return (
    <section className={styles.container} data-testid="edge-types-panel">
      <header className={styles.sectionHeader}>
        <span>Edge Types</span>
        <span className={styles.sectionActions}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              for (const e of activeEntries) {
                if (hiddenKinds.has(e.kind)) {
                  onToggle(e.kind);
                }
              }
            }}
            aria-label="Show all edge types"
          >
            All
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              for (const e of activeEntries) {
                if (!hiddenKinds.has(e.kind)) {
                  onToggle(e.kind);
                }
              }
            }}
            aria-label="Hide all edge types"
          >
            None
          </button>
        </span>
      </header>
      <div className={styles.sectionBody}>
        {entries.map((entry) => {
          const isVisible = !hiddenKinds.has(entry.kind);
          const meta = EDGE_KIND_META[entry.kind] ?? {
            label: entry.label,
            codicon: "symbol-misc",
            dotColor: DEFAULT_EDGE_DOT_COLOR,
          };
          return (
            <label
              key={entry.kind}
              className={`${styles.filterRow}${entry.disabled ? ` ${styles.filterRowDisabled}` : ""}`}
              data-testid={`edge-row-${entry.kind}`}
              aria-disabled={entry.disabled ? "true" : undefined}
              title={entry.disabled ? entry.tooltip : undefined}
            >
              <input
                type="checkbox"
                checked={!entry.disabled && isVisible}
                disabled={entry.disabled}
                onChange={entry.disabled ? undefined : () => onToggle(entry.kind)}
              />
              <span
                className={styles.edgeDot}
                data-testid="edge-dot"
                style={{ background: meta.dotColor }}
                aria-hidden="true"
              />
              <span>{meta.label}</span>
              <span className={styles.filterCount}>{entry.count}</span>
            </label>
          );
        })}
      </div>
      {allHidden && (
        <div role="status" className={styles.emptyState}>
          No edge types visible.
        </div>
      )}
    </section>
  );
}
