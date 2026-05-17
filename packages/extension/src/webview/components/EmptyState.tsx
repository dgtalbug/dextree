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
      <div className="dxt-empty-preview" aria-label="Graph preview">
        <div className="dxt-preview-canvas" aria-hidden="true">
          <span className="dxt-preview-node dxt-preview-node-file">src/app.ts</span>
          <span className="dxt-preview-link dxt-preview-link-defines" />
          <span className="dxt-preview-node dxt-preview-node-symbol dxt-preview-node-symbol-top">
            App
          </span>
          <span className="dxt-preview-link dxt-preview-link-calls" />
          <span className="dxt-preview-node dxt-preview-node-symbol dxt-preview-node-symbol-bottom">
            renderGraph
          </span>
        </div>
        <p className="dxt-preview-caption">
          Preview: files connect to symbols, and selecting a node jumps to source.
        </p>
      </div>
    </div>
  );
}
