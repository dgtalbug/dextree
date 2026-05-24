import type { GraphEdge } from "@dextree/core";

import { DepthSlider } from "./DepthSlider.js";
import { NodeFilterPanel } from "./NodeFilterPanel.js";
import type { NodeFilterEntry } from "./NodeFilterPanel.js";
import { SearchBar } from "./SearchBar.js";
import type { SearchResultItem } from "./graphViewTypes.js";

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
}: GraphToolbarProps) {
  return (
    <div className="dxt-toolbar" role="toolbar" aria-label="Graph toolbar">
      <button
        type="button"
        className="dxt-export-mermaid dxt-toolbar__export"
        onClick={onExportMermaid}
        title="Export graph as Mermaid (.mmd)"
        aria-label="Export as Mermaid"
      >
        <span className="codicon codicon-export" aria-hidden="true" />
      </button>
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
