import type { KeyboardEvent } from "react";

import type { IndexedWorkspaceRecord } from "../protocol/messages.js";
import styles from "./WorkspaceCard.module.css";

export interface WorkspaceCardProps {
  workspace: IndexedWorkspaceRecord;
  onSwitch: (workspaceRoot: string) => void;
}

function formatTimestamp(iso: string | null): string {
  if (iso === null) return "Never indexed";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

export function WorkspaceCard({ workspace, onSwitch }: WorkspaceCardProps) {
  const { name, path, isActive, frameworks } = {
    name: workspace.name,
    path: workspace.workspaceRoot,
    isActive: workspace.isActive,
    frameworks: workspace.frameworks,
  };

  const handleActivate = () => {
    if (isActive) return;
    onSwitch(workspace.workspaceRoot);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isActive ? -1 : 0}
      className={`${styles.card}${isActive ? ` ${styles.cardActive}` : ""}`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      aria-label={isActive ? `Active workspace ${name}` : `Switch to workspace ${name}`}
      aria-current={isActive ? "true" : undefined}
      data-testid="workspace-card"
      data-workspace-root={workspace.workspaceRoot}
    >
      <div className={styles.header}>
        <span
          className={`codicon codicon-${isActive ? "folder-active" : "folder"} ${styles.icon}`}
          aria-hidden="true"
        />
        <span className={styles.name}>{name}</span>
        {isActive && (
          <span className={styles.activePill}>
            <span className="codicon codicon-pulse" aria-hidden="true" />
            Active
          </span>
        )}
      </div>
      <div className={styles.path} title={path}>
        {path}
      </div>
      <div className={styles.stats} aria-label="Workspace stats">
        <span>
          <span className={styles.statValue}>{workspace.indexedFileCount}</span> files
        </span>
        <span>
          <span className={styles.statValue}>{workspace.graphNodeCount}</span> symbols
        </span>
        <span>
          <span className={styles.statValue}>{workspace.graphEdgeCount}</span> edges
        </span>
      </div>
      {frameworks.length > 0 && (
        <div className={styles.chipRow}>
          {frameworks.map((fw) => (
            <span key={fw} className="dxt-badge dxt-badge--framework" data-framework={fw}>
              {fw}
            </span>
          ))}
        </div>
      )}
      <div className={styles.arch}>
        <div className={styles.archTitle}>Architecture</div>
        {/*
         * IndexedWorkspaceRecord carries no per-layer breakdown yet, so the
         * strip is a single gray placeholder. Once the record gains a
         * layer histogram this becomes proportional --layer-* segments.
         */}
        <div
          className={styles.archStrip}
          data-testid="workspace-arch-strip"
          title="Re-index with classification to see architecture distribution."
          aria-label="Architecture distribution unavailable"
        >
          <span className={styles.archPlaceholder} />
        </div>
      </div>
      <div className={styles.timestamp}>
        Last indexed: {formatTimestamp(workspace.lastIndexedAt)}
      </div>
    </div>
  );
}
