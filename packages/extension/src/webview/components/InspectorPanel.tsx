import type { GraphNode } from "@dextree/core";
import type React from "react";

import styles from "./InspectorPanel.module.css";

export const INSPECTOR_BADGE_KEYS = [
  "kind",
  "exported",
  "importance",
  "layer",
  "framework",
] as const;
export type InspectorBadgeKey = (typeof INSPECTOR_BADGE_KEYS)[number];

export const BADGE_SEPARATOR = "·" as const;

export const IMPORTANCE_NEAR_ZERO_THRESHOLD = 0.0005 as const;

export const INSPECTOR_PANEL_WIDTH_PX = 320 as const;

const PLACEHOLDER = "—";

export interface InspectorNeighbor {
  id: string;
  label: string;
  filePath: string;
  symbolKind: string;
}

export interface InspectorNeighbors {
  calledBy: InspectorNeighbor[];
  calls: InspectorNeighbor[];
  implements: InspectorNeighbor[];
}

export interface InspectorPanelProps {
  selectedNode: GraphNode | null;
  onTraceFromHere?: ((nodeId: string) => void) | undefined;
  neighbors?: InspectorNeighbors;
  onNeighborClick?: (nodeId: string) => void;
}

interface BadgeRendering {
  text: string;
  tooltip?: string;
}

function renderKind(node: GraphNode): BadgeRendering {
  if (node.type === "symbol" && node.symbolKind !== undefined) {
    return { text: node.symbolKind };
  }
  return { text: node.type };
}

function renderExported(_node: GraphNode): BadgeRendering {
  // Deferred: GraphNode does not yet carry a visibility/exports indicator.
  return { text: PLACEHOLDER };
}

function renderImportance(node: GraphNode): BadgeRendering {
  const score = node.importance;
  if (score === undefined) return { text: PLACEHOLDER };
  if (score > 0 && score < IMPORTANCE_NEAR_ZERO_THRESHOLD) {
    return { text: "≈ 0", tooltip: score.toString() };
  }
  return { text: score.toFixed(3) };
}

function renderLayer(node: GraphNode): BadgeRendering {
  return { text: node.archLayer ?? PLACEHOLDER };
}

function renderFramework(node: GraphNode): BadgeRendering {
  if (node.framework === undefined) return { text: PLACEHOLDER };
  if (node.frameworkRole === undefined) return { text: node.framework };
  return { text: `${node.framework}${BADGE_SEPARATOR}${node.frameworkRole}` };
}

function badgeFor(key: InspectorBadgeKey, node: GraphNode): BadgeRendering {
  switch (key) {
    case "kind":
      return renderKind(node);
    case "exported":
      return renderExported(node);
    case "importance":
      return renderImportance(node);
    case "layer":
      return renderLayer(node);
    case "framework":
      return renderFramework(node);
  }
}

function EmptyState(): React.ReactElement {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMessage}>Select a node to inspect</div>
    </div>
  );
}

function NeighborSection({
  title,
  count,
  neighbors,
  onClick,
}: {
  title: string;
  count: number;
  neighbors: InspectorNeighbor[];
  onClick?: (id: string) => void;
}) {
  return (
    <>
      <div className={styles.neighborGroupTitle}>
        {title} · {count}
      </div>
      {neighbors.map((n) => (
        <button
          key={n.id}
          type="button"
          className={styles.neighborRow}
          data-testid={`neighbor-row-${n.id}`}
          onClick={() => onClick?.(n.id)}
          title={`${n.filePath}`}
        >
          <span className={`codicon codicon-symbol-${n.symbolKind}`} aria-hidden="true" />
          <span data-testid="neighbor-name">{n.label}</span>
          <span className={styles.neighborPath} data-testid="neighbor-path">
            {n.filePath}
          </span>
        </button>
      ))}
    </>
  );
}

function PopulatedState({
  node,
  onTraceFromHere,
  neighbors,
  onNeighborClick,
}: {
  node: GraphNode;
  onTraceFromHere?: ((nodeId: string) => void) | undefined;
  neighbors?: InspectorNeighbors;
  onNeighborClick?: (nodeId: string) => void;
}): React.ReactElement {
  return (
    <>
      <div className={styles.inspectorHeader}>
        <span
          className="codicon codicon-symbol-class"
          data-testid="inspector-icon"
          aria-hidden="true"
        />
        <div className={styles.inspectorTitle}>
          <div className={styles.inspectorName}>{node.label}</div>
          <div className={styles.inspectorMeta}>
            {node.filePath}
            {node.type === "symbol" ? `:${node.startLine}` : ""}
          </div>
          <div className={styles.inspectorBadges}>
            {INSPECTOR_BADGE_KEYS.map((key) => {
              const { text, tooltip } = badgeFor(key, node);
              return (
                <span
                  key={key}
                  className={styles.badge}
                  data-testid={`badge-${key}`}
                  title={tooltip}
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {node.signature !== undefined && (
        <div className={styles.signature} data-testid="inspector-signature">
          {node.signature}
        </div>
      )}

      {node.docstring !== undefined && (
        <div className={styles.docstring} data-testid="inspector-docstring">
          {node.docstring}
        </div>
      )}

      <div className={styles.inspectorBody}>
        {neighbors && (
          <>
            {neighbors.calledBy.length > 0 && (
              <NeighborSection
                title="Called by"
                count={neighbors.calledBy.length}
                neighbors={neighbors.calledBy}
                {...(onNeighborClick !== undefined ? { onClick: onNeighborClick } : {})}
              />
            )}
            {neighbors.calls.length > 0 && (
              <NeighborSection
                title="Calls"
                count={neighbors.calls.length}
                neighbors={neighbors.calls}
                {...(onNeighborClick !== undefined ? { onClick: onNeighborClick } : {})}
              />
            )}
            {neighbors.implements.length > 0 && (
              <NeighborSection
                title="Implements"
                count={neighbors.implements.length}
                neighbors={neighbors.implements}
                {...(onNeighborClick !== undefined ? { onClick: onNeighborClick } : {})}
              />
            )}
          </>
        )}
      </div>

      <div className={styles.inspectorActions}>
        {onTraceFromHere && (
          <button
            type="button"
            className={styles.actionBtn}
            data-testid="trace-from-here"
            onClick={() => onTraceFromHere(node.id)}
            title="Trace route from this node"
          >
            <span className="codicon codicon-rocket" aria-hidden="true" />
            Trace from here
          </button>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          title="Export subgraph"
          aria-label="Export"
        >
          <span className="codicon codicon-export" aria-hidden="true" />
          Export
        </button>
      </div>
    </>
  );
}

export function InspectorPanel({
  selectedNode,
  onTraceFromHere,
  neighbors,
  onNeighborClick,
}: InspectorPanelProps): React.ReactElement {
  return (
    <aside className={styles.panel} aria-label="Node inspector">
      <header className={styles.sectionHeader}>
        <span>Inspector</span>
      </header>
      {selectedNode === null ? (
        <EmptyState />
      ) : (
        <PopulatedState
          node={selectedNode}
          {...(onTraceFromHere !== undefined ? { onTraceFromHere } : {})}
          {...(neighbors !== undefined ? { neighbors } : {})}
          {...(onNeighborClick !== undefined ? { onNeighborClick } : {})}
        />
      )}
    </aside>
  );
}

export default InspectorPanel;
