import type { GraphNode } from "@dextree/core";
import type React from "react";

import styles from "./InspectorPanel.module.css";

/**
 * Inspector panel constants — runtime source of truth.
 *
 * Mirrors the spec contract at `specs/020-inspector-panel/contracts/inspector-panel.ts`.
 * Production code does not import from `specs/`; this file is the runtime declaration.
 * Keep both in sync.
 */
export const INSPECTOR_BADGE_KEYS = ["importance", "framework", "layer", "entry"] as const;
export type InspectorBadgeKey = (typeof INSPECTOR_BADGE_KEYS)[number];

/** Unicode middle dot (U+00B7) separating framework name from role. */
export const BADGE_SEPARATOR = "·" as const;

/**
 * Scores strictly below this value (but non-zero) render as "≈ 0" with the raw
 * value as a tooltip. At or above the threshold, render as `score.toFixed(3)`.
 */
export const IMPORTANCE_NEAR_ZERO_THRESHOLD = 0.0005 as const;

/** Fixed CSS width of the Inspector right rail. */
export const INSPECTOR_PANEL_WIDTH_PX = 280 as const;

const PLACEHOLDER = "—";

export interface InspectorPanelProps {
  selectedNode: GraphNode | null;
  /** Slice 023 — when provided, renders a "Trace from here" action button. */
  onTraceFromHere?: ((nodeId: string) => void) | undefined;
}

interface BadgeRendering {
  text: string;
  tooltip?: string;
}

function renderImportance(node: GraphNode): BadgeRendering {
  const score = node.importance;
  if (score === undefined) {
    return { text: PLACEHOLDER };
  }
  if (score > 0 && score < IMPORTANCE_NEAR_ZERO_THRESHOLD) {
    return { text: "≈ 0", tooltip: score.toString() };
  }
  return { text: score.toFixed(3) };
}

function renderFramework(node: GraphNode): BadgeRendering {
  if (node.framework === undefined) {
    return { text: PLACEHOLDER };
  }
  if (node.frameworkRole === undefined) {
    return { text: node.framework };
  }
  return { text: `${node.framework}${BADGE_SEPARATOR}${node.frameworkRole}` };
}

function badgeFor(key: InspectorBadgeKey, node: GraphNode): BadgeRendering {
  switch (key) {
    case "importance":
      return renderImportance(node);
    case "framework":
      return renderFramework(node);
    case "layer":
      return { text: capitalize(node.archLayer ?? PLACEHOLDER) };
    case "entry":
      return { text: capitalize(node.entryKind ?? PLACEHOLDER) };
  }
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function EmptyState(): React.ReactElement {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMessage}>Select a node to inspect</div>
      <div className={styles.badgeRow} aria-hidden="true">
        {INSPECTOR_BADGE_KEYS.map((key) => (
          <span key={key} className={styles.badgeSkeleton} data-testid="badge-skeleton">
            {PLACEHOLDER}
          </span>
        ))}
      </div>
    </div>
  );
}

function PopulatedState({
  node,
  onTraceFromHere,
}: {
  node: GraphNode;
  onTraceFromHere?: ((nodeId: string) => void) | undefined;
}): React.ReactElement {
  const kindLabel =
    node.type === "symbol" && node.symbolKind !== undefined ? node.symbolKind : node.type;

  return (
    <>
      <div className={styles.row}>
        <div className={styles.label} title={node.label}>
          {node.label}
        </div>
        <div className={styles.kind}>{kindLabel}</div>
        <div className={styles.filePath} title={node.filePath}>
          {node.filePath}
        </div>
      </div>

      {onTraceFromHere !== undefined && (
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.traceFromHere}
            data-testid="trace-from-here"
            onClick={() => onTraceFromHere(node.id)}
            title="Trace route from this node"
          >
            <span className="codicon codicon-rocket" aria-hidden="true" />
            Trace from here
          </button>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.sectionTitle}>Signature</div>
        {node.signature !== undefined ? (
          <div className={styles.signature} title={node.signature}>
            {node.signature}
          </div>
        ) : (
          <div className={styles.placeholder}>{PLACEHOLDER}</div>
        )}
      </div>

      <div className={styles.row}>
        <div className={styles.sectionTitle}>Docstring</div>
        {node.docstring !== undefined ? (
          <div className={styles.docstring}>{node.docstring}</div>
        ) : (
          <div className={styles.placeholder}>{PLACEHOLDER}</div>
        )}
      </div>

      <div className={styles.badgeRow}>
        {INSPECTOR_BADGE_KEYS.map((key) => {
          const { text, tooltip } = badgeFor(key, node);
          return (
            <span key={key} className={styles.badge} data-testid={`badge-${key}`} title={tooltip}>
              {text}
            </span>
          );
        })}
      </div>
    </>
  );
}

export function InspectorPanel({
  selectedNode,
  onTraceFromHere,
}: InspectorPanelProps): React.ReactElement {
  return (
    <aside className={styles.panel} aria-label="Node inspector">
      {selectedNode === null ? (
        <EmptyState />
      ) : (
        <PopulatedState node={selectedNode} onTraceFromHere={onTraceFromHere} />
      )}
    </aside>
  );
}

export default InspectorPanel;
