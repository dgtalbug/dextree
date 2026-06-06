import styles from "./NodeFilterPanel.module.css";

export interface NodeFilterEntry {
  /** Internal filter key — "file" | SymbolKind | "decorator" */
  key: string;
  /** Display label on the chip */
  label: string;
  /** Number of nodes of this kind in the current graph */
  count: number;
  /** Whether this entry is a disabled future stub */
  disabled?: boolean;
  /** Tooltip for disabled entries */
  tooltip?: string;
}

/** Maps node type filter keys to a Codicon class name. */
function codiconForKey(key: string): string {
  switch (key) {
    case "file":
      return "file";
    case "class":
      return "symbol-class";
    case "interface":
      return "symbol-interface";
    case "enum":
      return "symbol-enum";
    case "type":
      return "symbol-misc";
    case "function":
      return "symbol-function";
    case "method":
      return "symbol-method";
    case "property":
      return "symbol-variable";
    case "variable":
      return "symbol-variable";
    case "decorator":
      return "symbol-misc";
    default:
      return "symbol-misc";
  }
}

export const CANONICAL_NODE_FILTER_LIST: Readonly<Omit<NodeFilterEntry, "count">[]> = [
  { key: "file", label: "File" },
  { key: "class", label: "Class" },
  { key: "interface", label: "Interface" },
  { key: "function", label: "Function" },
  { key: "method", label: "Method" },
  { key: "property", label: "Property" },
  { key: "variable", label: "Variable" },
  { key: "enum", label: "Enum" },
  { key: "type", label: "Type" },
  {
    key: "decorator",
    label: "Decorator",
  },
];

export interface NodeFilterPanelProps {
  /** Ordered list of node kind entries to display */
  entries: NodeFilterEntry[];
  /** Set of currently hidden node kind keys */
  hiddenKinds: Set<string>;
  /** Called when user clicks an active (non-disabled) chip */
  onToggle: (key: string) => void;
}

export function NodeFilterPanel({ entries, hiddenKinds, onToggle }: NodeFilterPanelProps) {
  const activeNonDisabled = entries.filter((e) => !e.disabled);
  const allHidden =
    activeNonDisabled.length > 0 && activeNonDisabled.every((e) => hiddenKinds.has(e.key));

  return (
    <div className={styles.container} data-testid="node-filter-panel">
      <header className={styles.sectionHeader}>
        <span>Node Types</span>
        <span className={styles.sectionActions}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              for (const e of activeNonDisabled) {
                if (hiddenKinds.has(e.key)) {
                  onToggle(e.key);
                }
              }
            }}
            aria-label="Show all node types"
          >
            All
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              for (const e of activeNonDisabled) {
                if (!hiddenKinds.has(e.key)) {
                  onToggle(e.key);
                }
              }
            }}
            aria-label="Hide all node types"
          >
            None
          </button>
        </span>
      </header>
      <p className={styles.sectionHint}>Filter visible node types</p>
      <div className={styles.sectionBody}>
        {entries.map((entry) => {
          const isVisible = !hiddenKinds.has(entry.key);
          const ariaLabel = entry.disabled
            ? `${entry.label} nodes (unavailable)`
            : `${isVisible ? "Hide" : "Show"} ${entry.label} nodes`;

          return (
            <label
              key={entry.key}
              className={`${styles.filterRow}${entry.disabled ? ` ${styles.filterRowDisabled}` : ""}`}
              data-testid={`filter-row-${entry.key}`}
              aria-disabled={entry.disabled ? "true" : undefined}
              aria-label={ariaLabel}
              title={entry.disabled ? entry.tooltip : ariaLabel}
            >
              <input
                type="checkbox"
                checked={!entry.disabled && isVisible}
                disabled={entry.disabled}
                onChange={entry.disabled ? undefined : () => onToggle(entry.key)}
              />
              <span
                className={`codicon codicon-${codiconForKey(entry.key)}`}
                data-testid="filter-codicon"
                aria-hidden="true"
              />
              <span data-testid="filter-label">{entry.label}</span>
              <span className={styles.filterCount} data-testid="filter-count">
                {entry.count}
              </span>
            </label>
          );
        })}
      </div>
      {allHidden && (
        <div role="status" className={styles.emptyState}>
          No nodes match the current filters.
        </div>
      )}
    </div>
  );
}
