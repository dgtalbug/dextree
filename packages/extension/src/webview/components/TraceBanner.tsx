import type React from "react";

import styles from "./TraceBanner.module.css";
import type { TraceState } from "./graphViewTypes.js";

export interface TraceBannerProps {
  state: TraceState;
  startLabel: string | null;
  endLabel: string | null;
  onExit: () => void;
}

function bannerBody(
  state: TraceState,
  startLabel: string | null,
  endLabel: string | null,
): React.ReactNode {
  if (state.phase === "picking-start") {
    return <span>Click a start node</span>;
  }
  if (state.phase === "picking-end") {
    if (state.selfTraceError) {
      return <span className={styles.error}>Start and end must be different nodes</span>;
    }
    return (
      <span>
        <strong>{startLabel ?? "start"}</strong>
        {" → Click an end node"}
      </span>
    );
  }
  // path-active
  if (state.noPathFound) {
    return (
      <span>
        <strong>{startLabel ?? "start"}</strong>
        {" → "}
        <strong>{endLabel ?? "end"}</strong>
        {" · no path found"}
      </span>
    );
  }
  const hops = state.pathEdgeIds.length;
  return (
    <span>
      <strong>{startLabel ?? "start"}</strong>
      {" → "}
      <strong>{endLabel ?? "end"}</strong>
      {" · "}
      {hops} hops · shortest path
    </span>
  );
}

export function TraceBanner({
  state,
  startLabel,
  endLabel,
  onExit,
}: TraceBannerProps): React.ReactElement {
  return (
    <div className={styles.banner} role="status" data-testid="trace-banner">
      <span className={`codicon codicon-rocket ${styles.icon}`} aria-hidden="true" />
      <span className={styles.body}>{bannerBody(state, startLabel, endLabel)}</span>
      <button
        type="button"
        className={styles.exitButton}
        onClick={onExit}
        title="Exit trace mode (Esc)"
        aria-label="Exit trace"
      >
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  );
}

export default TraceBanner;
