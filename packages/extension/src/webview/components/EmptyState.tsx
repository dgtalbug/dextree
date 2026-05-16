/**
 * Shown when the extension host reports zero indexed files (FR-006).
 */
export function EmptyState() {
  return (
    <div className="dxt-empty">
      <span className="codicon codicon-symbol-class" aria-hidden="true" />
      <p>No symbols indexed yet.</p>
      <p>
        Use <strong>Dextree: Index Workspace</strong> to index your project files.
      </p>
    </div>
  );
}
