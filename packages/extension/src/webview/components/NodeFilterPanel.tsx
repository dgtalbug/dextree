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

export const CANONICAL_NODE_FILTER_LIST: Readonly<Omit<NodeFilterEntry, "count">[]> = [
  { key: "file", label: "Folder" },
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
    disabled: true,
    tooltip: "Available when DecoratorExtractor ships (slice 031)",
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
    <div className={styles.nodeFilterPanel} role="group" aria-label="Node type filters">
      <div className={styles.chips}>
        {entries.map((entry) => {
          const isVisible = !hiddenKinds.has(entry.key);
          const ariaLabel = entry.disabled
            ? `${entry.label} nodes (unavailable)`
            : `${isVisible ? "Hide" : "Show"} ${entry.label} nodes`;

          return (
            <button
              key={entry.key}
              type="button"
              role="checkbox"
              className={[
                styles.chip,
                !isVisible || entry.disabled ? styles.chipInactive : "",
                entry.disabled ? styles.chipDisabled : "",
                entry.count === 0 && !entry.disabled ? styles.chipEmpty : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-checked={!entry.disabled && isVisible}
              aria-label={ariaLabel}
              aria-disabled={entry.disabled ? "true" : undefined}
              tabIndex={entry.disabled ? -1 : 0}
              title={entry.disabled ? entry.tooltip : undefined}
              onClick={entry.disabled ? undefined : () => onToggle(entry.key)}
            >
              {entry.label}
              <span className={styles.badge} aria-label={`${entry.count} nodes`}>
                ({entry.count})
              </span>
            </button>
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
