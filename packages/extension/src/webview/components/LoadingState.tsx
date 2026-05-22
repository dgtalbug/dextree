import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import type { IndexingMessage } from "../protocol/messages.js";

/**
 * Shown while the extension host is indexing or before the first symbols message
 * arrives (FR-003, FR-008).
 */
interface LoadingStateProps {
  indexing?: IndexingMessage;
  label?: string;
}

function useReducedMotionPreference(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function LoadingState({
  indexing,
  label = "Indexing symbols...",
}: LoadingStateProps) {
  const reducedMotion = useReducedMotionPreference();
  const total = indexing?.total ?? 0;
  const current = indexing?.current ?? 0;
  const progress = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0;
  const statusTone =
    indexing?.status === "failed"
      ? "dxt-index-rail-failed"
      : indexing?.status === "cancelled"
        ? "dxt-index-rail-cancelled"
        : "dxt-index-rail-active";
  const fileChip =
    indexing?.fileName ??
    (indexing?.status === "starting" ? "Preparing workspace graph" : "Waiting for graph payload");
  const summary =
    indexing === undefined
      ? label
      : `${current} / ${total}${indexing.failed > 0 ? ` · ${indexing.failed} failed` : ""}${
          indexing.cancelled ? " · cancelled" : ""
        }`;

  return (
    <div className="dxt-loading-overlay" role="status" aria-live="polite">
      <motion.div
        className={`dxt-index-rail ${statusTone}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="dxt-index-rail-header">
          <span className="dxt-index-chip">{fileChip}</span>
          {indexing !== undefined ? <span className="dxt-index-count">{summary}</span> : null}
        </div>

        <div className="dxt-index-track" aria-hidden="true">
          <motion.div
            className="dxt-index-progress"
            animate={{ scaleX: Math.max(progress, 0.02) }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          />
          <motion.div
            className="dxt-index-beam"
            {...(reducedMotion
              ? {}
              : {
                  animate: { x: ["-28%", "112%"] },
                  transition: {
                    duration: 1.4,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear" as const,
                  },
                })}
          />
        </div>

        <div className="dxt-index-meta">
          <span className="codicon codicon-type-hierarchy" aria-hidden="true" />
          <span>{label}</span>
        </div>
      </motion.div>
    </div>
  );
}
