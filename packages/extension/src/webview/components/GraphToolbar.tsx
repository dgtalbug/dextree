import type { GraphEdge } from "@dextree/core";

import { DepthSlider } from "./DepthSlider.js";
import { NodeFilterPanel } from "./NodeFilterPanel.js";
import type { NodeFilterEntry } from "./NodeFilterPanel.js";
import { SearchBar } from "./SearchBar.js";
import type { SearchResultItem, TracePhase } from "./graphViewTypes.js";

const EDGE_KIND_LABELS: Record<GraphEdge["kind"], string> = {
  DEFINES: "Defines",
  IMPORTS: "Imports",
  CALLS: "Calls",
  INHERITS: "Extends",
  INSTANTIATES: "New",
};

const IMPLEMENTS_TOOLTIP = "Available when ImplementsExtractor ships (slice 031)";

export interface GraphToolbarProps {
  onExportMermaid: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  edgeKinds: GraphEdge["kind"][];
  hiddenEdgeKinds: Set<GraphEdge["kind"]>;
  onToggleEdgeKind: (kind: GraphEdge["kind"]) => void;
  // Node filter (new — slice 019):
  nodeFilterEntries: NodeFilterEntry[];
  hiddenNodeKinds: Set<string>;
  onToggleNodeKind: (key: string) => void;
  // Search + Depth (new — slice 022):
  searchQuery: string;
  searchResults: SearchResultItem[];
  searchFocusedIndex: number;
  onSearchQueryChange: (query: string) => void;
  onSearchSelectResult: (nodeId: string, index: number) => void;
  onSearchClear: () => void;
  depth: number;
  depthEnabled: boolean;
  onDepthChange: (depth: number) => void;
  // Trace mode (new — slice 023):
  tracePhase: TracePhase;
  onTraceToggle: () => void;
  onTraceExit: () => void;
  // Workspace switcher (new — slice 024):
  workspaceName?: string;
  workspaceFrameworks?: readonly string[];
  onWorkspaceSwitcherClick?: () => void;
}

function EdgeFilterBar({
  edgeKinds,
  hiddenKinds,
  onToggle,
}: {
  edgeKinds: GraphEdge["kind"][];
  hiddenKinds: Set<GraphEdge["kind"]>;
  onToggle: (kind: GraphEdge["kind"]) => void;
}) {
  return (
    <div className="dxt-edge-filter-bar" role="group" aria-label="Edge type filters">
      {edgeKinds.map((kind) => {
        const active = !hiddenKinds.has(kind);
        const label = `${active ? "Hide" : "Show"} ${EDGE_KIND_LABELS[kind]} edges`;

        return (
          <button
            key={kind}
            type="button"
            className={`dxt-edge-filter-pill${active ? "" : " dxt-edge-filter-pill--disabled"}`}
            data-kind={kind}
            onClick={() => onToggle(kind)}
            aria-label={label}
            aria-pressed={active}
            title={label}
          >
            <span className="dxt-edge-filter-dot" aria-hidden="true" />
            {EDGE_KIND_LABELS[kind]}
          </button>
        );
      })}
      {/* Disabled Implements stub — always shown, not interactive */}
      <button
        type="button"
        className="dxt-edge-filter-pill dxt-edge-filter-pill--disabled dxt-edge-filter-pill--stub"
        aria-disabled="true"
        title={IMPLEMENTS_TOOLTIP}
        tabIndex={-1}
      >
        <span className="dxt-edge-filter-dot" aria-hidden="true" />
        Implements
      </button>
    </div>
  );
}

export function GraphToolbar({
  onExportMermaid,
  showMinimap,
  onToggleMinimap,
  edgeKinds,
  hiddenEdgeKinds,
  onToggleEdgeKind,
  nodeFilterEntries,
  hiddenNodeKinds,
  onToggleNodeKind,
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
  workspaceName,
  workspaceFrameworks,
  onWorkspaceSwitcherClick,
}: GraphToolbarProps) {
  const traceActive = tracePhase !== "idle";
  return (
    <div className="dxt-toolbar" role="toolbar" aria-label="Graph toolbar">
      {workspaceName !== undefined && (
        <button
          type="button"
          className="dxt-workspace-switcher"
          onClick={onWorkspaceSwitcherClick}
          title={`Switch workspace (current: ${workspaceName})`}
          aria-label={`Switch workspace (current: ${workspaceName})`}
        >
          <span className="codicon codicon-folder-active" aria-hidden="true" />
          <span className="dxt-workspace-switcher__name">{workspaceName}</span>
          {workspaceFrameworks && workspaceFrameworks.length > 0 && (
            <span className="dxt-workspace-switcher__chips">
              {workspaceFrameworks.map((fw) => (
                <span key={fw} className="dxt-badge dxt-badge--framework" data-framework={fw}>
                  {fw}
                </span>
              ))}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        className="dxt-export-mermaid dxt-toolbar__export"
        onClick={onExportMermaid}
        title="Export graph as Mermaid (.mmd)"
        aria-label="Export as Mermaid"
      >
        <span className="codicon codicon-export" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="dxt-toolbar__trace"
        onClick={onTraceToggle}
        title={traceActive ? "Cancel trace" : "Trace route between two nodes"}
        aria-label="Toggle trace route mode"
        aria-pressed={traceActive}
      >
        <span className="codicon codicon-rocket" aria-hidden="true" />
      </button>
      {traceActive && (
        <>
          <button
            type="button"
            className="dxt-toolbar__trace-export"
            disabled
            title="Export this trace as a sequence diagram — available after slice S7.14"
            aria-label="Export this trace (disabled)"
          >
            <span className="codicon codicon-export" aria-hidden="true" />
            Export
          </button>
          <button
            type="button"
            className="dxt-toolbar__trace-exit"
            onClick={onTraceExit}
            title="Exit trace mode (Esc)"
            aria-label="Exit trace mode"
          >
            <span className="codicon codicon-close" aria-hidden="true" />
            Exit trace
          </button>
        </>
      )}
      <SearchBar
        query={searchQuery}
        results={searchResults}
        focusedIndex={searchFocusedIndex}
        onQueryChange={onSearchQueryChange}
        onSelectResult={onSearchSelectResult}
        onClear={onSearchClear}
      />
      <NodeFilterPanel
        entries={nodeFilterEntries}
        hiddenKinds={hiddenNodeKinds}
        onToggle={onToggleNodeKind}
      />
      <div className="dxt-toolbar__pills">
        <EdgeFilterBar
          edgeKinds={edgeKinds}
          hiddenKinds={hiddenEdgeKinds}
          onToggle={onToggleEdgeKind}
        />
      </div>
      <DepthSlider depth={depth} enabled={depthEnabled} onDepthChange={onDepthChange} />
      <button
        type="button"
        className="dxt-minimap-toggle dxt-toolbar__minimap-toggle"
        onClick={onToggleMinimap}
        title="Toggle minimap"
        aria-label="Toggle minimap"
        aria-pressed={showMinimap}
      >
        <span className="codicon codicon-map" aria-hidden="true" />
      </button>
    </div>
  );
}
