import type { IndexedWorkspaceRecord } from "../protocol/messages.js";
import { WorkspaceCard } from "./WorkspaceCard.js";
import styles from "./WorkspacesPage.module.css";

export interface WorkspacesPageProps {
  /** Loaded workspace records, or `null` while the host is fetching the list. */
  workspaces: IndexedWorkspaceRecord[] | null;
  onBack: () => void;
  onSwitch: (workspaceRoot: string) => void;
}

export function WorkspacesPage({ workspaces, onBack, onSwitch }: WorkspacesPageProps) {
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
        <h2 className={styles.title}>Workspaces</h2>
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
