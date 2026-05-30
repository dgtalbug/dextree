import { DepthSlider } from "./DepthSlider.js";
import { SearchBar } from "./SearchBar.js";
import type { LayoutPresetId, SearchResultItem, TracePhase } from "./graphViewTypes.js";
import { LAYOUT_PRESET_OPTIONS } from "./graphLayoutPresets.js";
import styles from "./GraphToolbar.module.css";

export interface GraphToolbarProps {
  onExportMermaid: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  searchQuery: string;
  searchResults: SearchResultItem[];
  searchFocusedIndex: number;
  onSearchQueryChange: (query: string) => void;
  onSearchSelectResult: (nodeId: string, index: number) => void;
  onSearchClear: () => void;
  depth: number;
  depthEnabled: boolean;
  onDepthChange: (depth: number) => void;
  tracePhase: TracePhase;
  onTraceToggle: () => void;
  onTraceExit: () => void;
  onExportTrace?: () => void;
  canExportTrace?: boolean;
  workspaceName?: string;
  workspaceFrameworks?: readonly string[];
  onWorkspaceSwitcherClick?: () => void;
  activeLayoutPreset: LayoutPresetId;
  onSelectLayoutPreset: (preset: LayoutPresetId) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomReset: () => void;
  /**
   * Workspace actions relocated from the legacy right-rail panel (slice 033).
   * The whole group renders only when `onReindex` is provided, so GraphView
   * usages that don't own these handlers keep the mockup-clean toolbar.
   */
  onReindex?: () => void;
  onClearWorkspace?: () => void;
  onClearAll?: () => void;
  onToggleSourceOnly?: () => void;
  sourceOnly?: boolean;
  isIndexing?: boolean;
}

export function GraphToolbar({
  onExportMermaid,
  showMinimap,
  onToggleMinimap,
  searchQuery,
  searchResults,
  searchFocusedIndex,
  onSearchQueryChange,
  onSearchSelectResult,
  onSearchClear,
  depth,
  depthEnabled,
  onDepthChange,
  tracePhase,
  onTraceToggle,
  onTraceExit,
  onExportTrace,
  canExportTrace = false,
  workspaceName,
  workspaceFrameworks,
  onWorkspaceSwitcherClick,
  activeLayoutPreset,
  onSelectLayoutPreset,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomReset,
  onReindex,
  onClearWorkspace,
  onClearAll,
  onToggleSourceOnly,
  sourceOnly = false,
  isIndexing = false,
}: GraphToolbarProps) {
  const traceActive = tracePhase !== "idle";
  return (
    <header className={styles.toolbar} role="toolbar" aria-label="Graph toolbar">
      {/* Group 1: Workspace switcher */}
      {workspaceName !== undefined && (
        <div className={styles.group} data-testid="toolbar-group" aria-label="Workspace switcher">
          <button
            type="button"
            className={styles.workspaceSwitcher}
            onClick={onWorkspaceSwitcherClick}
            title={`Switch workspace (current: ${workspaceName})`}
            aria-label={`Switch workspace (current: ${workspaceName})`}
          >
            <span className="codicon codicon-database" aria-hidden="true" />
            <span>
              <span className={styles.workspaceName}>{workspaceName}</span>
              {workspaceFrameworks && workspaceFrameworks.length > 0 && (
                <span className={styles.workspaceMeta}>
                  {" · "}
                  {workspaceFrameworks.join(" + ")}
                </span>
              )}
            </span>
            <span className="codicon codicon-chevron-down" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Group 2: Search */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="Search">
        <SearchBar
          query={searchQuery}
          results={searchResults}
          focusedIndex={searchFocusedIndex}
          onQueryChange={onSearchQueryChange}
          onSelectResult={onSearchSelectResult}
          onClear={onSearchClear}
        />
      </div>

      {/* Group 3: Zoom controls */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="Zoom controls">
        <button
          type="button"
          className={styles.iconBtn}
          title="Zoom in"
          aria-label="Zoom in"
          onClick={onZoomIn}
        >
          <span className="codicon codicon-zoom-in" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="Zoom out"
          aria-label="Zoom out"
          onClick={onZoomOut}
        >
          <span className="codicon codicon-zoom-out" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="Fit to screen"
          aria-label="Fit to screen"
          onClick={onZoomFit}
        >
          <span className="codicon codicon-screen-full" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="Reset layout"
          aria-label="Reset layout"
          onClick={onZoomReset}
        >
          <span className="codicon codicon-refresh" aria-hidden="true" />
        </button>
      </div>

      {/* Group 4: Depth slider */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="Depth controls">
        <DepthSlider depth={depth} enabled={depthEnabled} onDepthChange={onDepthChange} />
      </div>

      {/* Group 5: Trace */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="Trace controls">
        <button
          type="button"
          className={styles.iconBtn}
          title={traceActive ? "Cancel trace" : "Trace route between two nodes"}
          aria-label="Toggle trace route mode"
          aria-pressed={traceActive}
          onClick={onTraceToggle}
        >
          <span className="codicon codicon-rocket" aria-hidden="true" />
          Trace
        </button>
        {traceActive && (
          <>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={!canExportTrace || onExportTrace === undefined}
              onClick={onExportTrace}
              title={
                canExportTrace && onExportTrace !== undefined
                  ? "Export this trace as a Mermaid sequence diagram"
                  : "Resolve a trace path between two nodes to enable sequence export"
              }
              aria-label={
                canExportTrace && onExportTrace !== undefined
                  ? "Export this trace as a sequence diagram"
                  : "Export this trace (disabled)"
              }
            >
              <span className="codicon codicon-export" aria-hidden="true" />
              Export trace
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onTraceExit}
              title="Exit trace mode (Esc)"
              aria-label="Exit trace mode"
            >
              <span className="codicon codicon-close" aria-hidden="true" />
              Exit
            </button>
          </>
        )}
      </div>

      {/* Group 6: Layout */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="Layout controls">
        <select
          className={styles.layoutSelect}
          value={activeLayoutPreset}
          aria-label="Layout preset"
          title="Switch graph layout"
          onChange={(event) => {
            onSelectLayoutPreset(event.target.value as LayoutPresetId);
          }}
        >
          {LAYOUT_PRESET_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} title={option.description}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Group: Workspace actions (relocated from legacy right panel, slice 033) */}
      {onReindex !== undefined && (
        <div className={styles.group} data-testid="toolbar-group" aria-label="Workspace actions">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onReindex}
            disabled={isIndexing}
            title={isIndexing ? "Indexing…" : "Re-index this workspace"}
            aria-label={isIndexing ? "Indexing" : "Re-index workspace"}
          >
            <span className="codicon codicon-sync" aria-hidden="true" />
            {isIndexing ? "Indexing…" : "Re-index"}
          </button>
          {onToggleSourceOnly !== undefined && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onToggleSourceOnly}
              aria-pressed={sourceOnly}
              title="Toggle source-only view (hides markdown and test files)"
              aria-label="Toggle source-only view"
            >
              <span className="codicon codicon-filter" aria-hidden="true" />
              {sourceOnly ? "All files" : "Source only"}
            </button>
          )}
          {onClearWorkspace !== undefined && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClearWorkspace}
              disabled={isIndexing}
              title="Clear the current workspace index"
              aria-label="Clear current workspace index"
            >
              <span className="codicon codicon-trash" aria-hidden="true" />
            </button>
          )}
          {onClearAll !== undefined && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClearAll}
              disabled={isIndexing}
              title="Clear all indexed workspaces"
              aria-label="Clear all indexed workspaces"
            >
              <span className="codicon codicon-clear-all" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className={styles.spacer} />

      {/* Group 7: Minimap + Export */}
      <div className={styles.group} data-testid="toolbar-group" aria-label="View controls">
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onToggleMinimap}
          title="Toggle minimap"
          aria-label="Toggle minimap"
          aria-pressed={showMinimap}
        >
          <span className="codicon codicon-map" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.accentBtn}
          onClick={onExportMermaid}
          title="Open Mermaid preview"
          aria-label="Open Mermaid preview export"
          data-testid="export-accent"
        >
          <span className="codicon codicon-export" aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  );
}
