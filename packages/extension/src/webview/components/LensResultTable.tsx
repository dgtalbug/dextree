import type React from "react";

import styles from "./LensResultTable.module.css";

/**
 * One rendered row of the active lens's ranked results. `metric` is the lens's
 * ranking value (callee count, fan-in, PageRank, …) already formatted for
 * display, or `null` for categorical lenses (dead-code) where there is no rank.
 */
export interface LensResultRow {
  nodeId: string;
  label: string;
  metric: string | null;
}

export interface LensResultTableProps {
  /** Title of the active lens, shown as the table caption. */
  lensTitle: string;
  /** Ranked rows; highest-ranked first. Empty renders a "no matches" hint. */
  rows: readonly LensResultRow[];
  /** Node id currently emphasised (selected) on the canvas, if any. */
  selectedNodeId: string | null;
  /** Fired when a row is activated — GraphView selects + flies to the node. */
  onSelectRow: (nodeId: string) => void;
}

/**
 * Presentational ranked-result table for the active lens. Pure: it renders the
 * rows it is given and emits a select event; it never touches the graph,
 * camera, or selection state. GraphView feeds it `rankLensMatches` output
 * (enriched with labels) and wires `onSelectRow` to the canvas selection path.
 */
export function LensResultTable({
  lensTitle,
  rows,
  selectedNodeId,
  onSelectRow,
}: LensResultTableProps): React.ReactElement {
  return (
    <section
      className={styles.table}
      aria-label={`${lensTitle} results`}
      data-testid="lens-result-table"
    >
      <header className={styles.caption}>
        <span className={styles.captionTitle}>{lensTitle}</span>
        <span className={styles.captionCount}>{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className={styles.empty} role="status">
          No matches in the current graph.
        </p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.nodeId}>
              <button
                type="button"
                className={styles.row}
                data-testid={`lens-result-row-${row.nodeId}`}
                aria-current={row.nodeId === selectedNodeId ? "true" : undefined}
                onClick={() => onSelectRow(row.nodeId)}
                title={row.label}
              >
                <span className={styles.rowLabel}>{row.label}</span>
                {row.metric !== null && <span className={styles.rowMetric}>{row.metric}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default LensResultTable;
