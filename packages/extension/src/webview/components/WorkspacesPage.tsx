import type { IndexedWorkspaceRecord } from "../protocol/messages.js";
import { WorkspaceCard } from "./WorkspaceCard.js";
import styles from "./WorkspacesPage.module.css";

export interface WorkspacesPageProps {
  /** Loaded workspace records, or `null` while the host is fetching the list. */
  workspaces: IndexedWorkspaceRecord[] | null;
  onBack: () => void;
  onSwitch: (workspaceRoot: string) => void;
  /** Re-index every known workspace (slice 033 T035). Optional — omitting it hides the action. */
  onRescanAll?: () => void;
  /** Pick another folder to index (slice 033 T035). Optional — omitting it hides the action. */
  onOpenAnother?: () => void;
}

export function WorkspacesPage({
  workspaces,
  onBack,
  onSwitch,
  onRescanAll,
  onOpenAnother,
}: WorkspacesPageProps) {
  return (
    <div className={styles.page} data-testid="workspaces-page">
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          aria-label="Back to graph"
        >
          <span className="codicon codicon-arrow-left" aria-hidden="true" />
          <span>Back to graph</span>
        </button>
        <h2 className={styles.title}>Indexed workspaces</h2>
        <div className={styles.headerActions}>
          {onRescanAll !== undefined && (
            <button
              type="button"
              className={styles.headerButton}
              onClick={onRescanAll}
              title="Re-index every known workspace"
            >
              <span className="codicon codicon-refresh" aria-hidden="true" />
              Re-scan all
            </button>
          )}
          {onOpenAnother !== undefined && (
            <button
              type="button"
              className={`${styles.headerButton} ${styles.headerButtonAccent}`}
              onClick={onOpenAnother}
              title="Open another workspace to index"
            >
              <span className="codicon codicon-database" aria-hidden="true" />
              Open another workspace…
            </button>
          )}
        </div>
      </header>

      {workspaces === null ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <div className={styles.grid} aria-hidden="true">
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
          <p>Loading workspaces…</p>
        </div>
      ) : workspaces.length === 0 ? (
        <div className={styles.empty}>
          <p>No workspaces indexed yet. Run Dextree: Index Workspace to get started.</p>
        </div>
      ) : (
        <div className={styles.grid} role="list" aria-label="Indexed workspaces">
          {workspaces.map((ws) => (
            <div role="listitem" key={ws.workspaceRoot}>
              <WorkspaceCard workspace={ws} onSwitch={onSwitch} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
