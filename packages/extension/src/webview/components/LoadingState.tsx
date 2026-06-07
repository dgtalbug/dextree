import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import type { IndexingMessage } from "../protocol/messages.js";

/**
 * Shown while the extension host is indexing or before the first symbols message
 * arrives.
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

const PULSE_NODES = [
  { cx: 50, cy: 18 },
  { cx: 20, cy: 52 },
  { cx: 80, cy: 52 },
  { cx: 35, cy: 82 },
  { cx: 65, cy: 82 },
  { cx: 50, cy: 60 },
] as const;

const PULSE_LINKS = [
  [0, 1],
  [0, 2],
  [0, 5],
  [1, 3],
  [2, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
  [3, 4],
] as const;

function GraphPulse({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="dxt-graph-pulse" aria-hidden="true">
      {PULSE_LINKS.map(([i, j], idx) => {
        const source = PULSE_NODES[i];
        const target = PULSE_NODES[j];
        const length = Math.hypot(target.cx - source.cx, target.cy - source.cy);
        return (
          <motion.line
            key={idx}
            x1={source.cx}
            y1={source.cy}
            x2={target.cx}
            y2={target.cy}
            className="dxt-pulse-edge"
            strokeDasharray={`${length * 2}`}
            strokeDashoffset={length * 2}
            {...(reducedMotion
              ? {}
              : {
                  animate: { strokeDashoffset: [length * 2, 0, -(length * 2)] },
                  transition: {
                    duration: 2.6,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear" as const,
                    delay: idx * 0.22,
                  },
                })}
          />
        );
      })}

      {PULSE_NODES.map((node, idx) => (
        <motion.circle
          key={idx}
          cx={node.cx}
          cy={node.cy}
          className="dxt-pulse-node"
          {...(reducedMotion
            ? { r: 3.8 }
            : {
                animate: { r: [3.2, 5.0, 3.2], opacity: [0.55, 1, 0.55] },
                transition: {
                  duration: 1.9,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut" as const,
                  delay: idx * 0.3,
                },
              })}
        />
      ))}
    </svg>
  );
}

export function LoadingState({ indexing, label = "Indexing symbols..." }: LoadingStateProps) {
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
        <GraphPulse reducedMotion={reducedMotion} />

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
