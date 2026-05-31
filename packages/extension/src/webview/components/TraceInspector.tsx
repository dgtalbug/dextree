import type React from "react";

import styles from "./TraceInspector.module.css";
import type { TracePath } from "./graphViewTypes.js";

const SHOW_ALL_PATHS_TOOLTIP = "Deferred — will be available in a future release";

export interface TraceInspectorProps {
  tracePath: TracePath | null;
  noPathFound: boolean;
  startLabel: string | null;
  endLabel: string | null;
  /** Called when a step row in the path list is clicked (animate camera to node). */
  onStepClick: (nodeId: string) => void;
}

export function TraceInspector({
  tracePath,
  noPathFound,
  startLabel,
  endLabel,
  onStepClick,
}: TraceInspectorProps): React.ReactElement {
  return (
    <aside className={styles.panel} aria-label="Trace details">
      <header className={styles.header}>
        <span className="codicon codicon-rocket" aria-hidden="true" />
        <span className={styles.headerTitle}>Trace details</span>
      </header>

      {noPathFound && (
        <div className={styles.noPath} role="status">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            {startLabel ?? "start"} → {endLabel ?? "end"}: no path found
          </span>
        </div>
      )}

      {tracePath !== null && (
        <>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <strong>{startLabel ?? "start"}</strong>
              <span className={styles.arrow}>→</span>
              <strong>{endLabel ?? "end"}</strong>
            </div>
            <div className={styles.metrics}>
              <span>{tracePath.hopCount} hops</span>
              <span>·</span>
              <span>{tracePath.fileCount} files</span>
            </div>
          </div>

          {tracePath.crossesFrameworkBoundary && (
            <div className={styles.boundaryBadge} role="status">
              <span className="codicon codicon-references" aria-hidden="true" />
              Crosses framework boundary
            </div>
          )}

          {tracePath.layersCrossed.length > 0 && (
            <section className={styles.layers}>
              <div className={styles.sectionTitle}>Layers crossed</div>
              <ul className={styles.layerList}>
                {tracePath.layersCrossed.map((layer, idx) => (
                  <li key={`${layer}-${idx}`} className={styles.layerRow}>
                    {layer}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.steps}>
            <div className={styles.sectionTitle}>Path steps</div>
            <ul className={styles.stepList}>
              {tracePath.nodeIds.map((nodeId, idx) => (
                <li key={nodeId}>
                  <button
                    type="button"
                    className={styles.stepRow}
                    data-testid={`trace-step-${nodeId}`}
                    onClick={() => onStepClick(nodeId)}
                    title="Jump to this node"
                  >
                    <span className={styles.stepIndex}>{idx + 1}.</span>
                    <span className={styles.stepLabel}>
                      {idx === 0
                        ? (startLabel ?? nodeId)
                        : idx === tracePath.nodeIds.length - 1
                          ? (endLabel ?? nodeId)
                          : nodeId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.disabledAction}
          disabled
          title={SHOW_ALL_PATHS_TOOLTIP}
        >
          Show all paths (slower)
        </button>
      </div>
    </aside>
  );
}

export default TraceInspector;
