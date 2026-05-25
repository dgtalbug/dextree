import type {
  ArchitecturalLayer,
  EntryKind,
  GraphEdge,
  GraphNode,
  SymbolKind,
} from "@dextree/core";

// ---------------------------------------------------------------------------
// Layout presets (slice 025)
// ---------------------------------------------------------------------------

/** Toolbar layout preset identifiers exposed by slice 025. */
export type LayoutPresetId = "forceAtlas2" | "circular" | "hierarchical";

/** Static metadata used to render the layout dropdown option list. */
export interface LayoutPresetOption {
  id: LayoutPresetId;
  label: "ForceAtlas2" | "Circular" | "Hierarchical";
  description: string;
}

/**
 * Non-blocking local notice surfaced inside GraphView when a preset request
 * is rejected. Slice 025 only emits this for the Hierarchical fallback path.
 */
export interface LayoutNotice {
  level: "info";
  preset: "hierarchical";
  message: string;
}

/** Tracks the active preset and any pending fallback notice. */
export interface LayoutSelectionState {
  activePreset: LayoutPresetId;
  notice: LayoutNotice | null;
}

/** Coordinate snapshot used to restore the prior layout on Hierarchical rejection. */
export type GraphLayoutSnapshot = Map<string, { x: number; y: number }>;

/** Layered placement output from graphology-dag topological generations. */
export interface HierarchicalGeneration {
  layerIndex: number;
  nodeIds: readonly string[];
}

/** Result of applying a layout preset to the currently visible graph. */
export type LayoutApplicationResult =
  | {
      status: "applied";
      preset: LayoutPresetId;
      ranReadabilityPass: boolean;
      notice: null;
    }
  | {
      status: "noop";
      preset: LayoutPresetId;
      reason: "already-active" | "trivial-graph";
      ranReadabilityPass: false;
      notice: null;
    }
  | {
      status: "rejected";
      preset: "hierarchical";
      fallbackPreset: LayoutPresetId;
      reason: "cyclic" | "no-directed-edges" | "single-generation" | "overfull-generation";
      ranReadabilityPass: false;
      notice: LayoutNotice;
    };

export interface ThemeColors {
  backgroundColor: string;
  labelColor: string;
  disabledColor: string;
  fileNodeColor: string;
  symbolKindColors: Record<SymbolKind | "default", string>;
  definesEdgeColor: string;
  importsEdgeColor: string;
  callsEdgeColor: string;
  inheritsEdgeColor: string;
  instantiatesEdgeColor: string;
  /** Yellow used for active trace path edges (slice 023). */
  tracePathEdgeColor: string;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (filePath: string, line: number) => void;
  onExportMermaid: () => void;
  /** Currently displayed workspace name (slice 024). Undefined hides the toolbar button. */
  workspaceName?: string;
  /** Framework chips shown next to the workspace name (slice 024). May be empty. */
  workspaceFrameworks?: readonly string[];
  /** Click handler for the toolbar workspace switcher button (slice 024). */
  onWorkspaceSwitcherClick?: () => void;
}

export interface GraphNodeAttributes {
  label: string;
  filePath: string;
  startLine: number;
  nodeKind: GraphNode["type"];
  symbolKind?: GraphNode["symbolKind"];
  x: number;
  y: number;
  size: number;
  baseSize: number;
  color: string;
  baseColor: string;
  /** Set on symbol nodes only. File nodes never carry classification. */
  entryKind?: EntryKind;
  /** Set on symbol nodes only. File nodes never carry classification. */
  archLayer?: ArchitecturalLayer;
}

/**
 * GraphView-local rendering state for an entry symbol. Computed on the fly
 * from `GraphNodeAttributes.entryKind` — symbols with `unclassified` or
 * missing entryKind keep the standard symbol rendering.
 */
export interface EntryNodeVisualState {
  entryKind: EntryKind | undefined;
  usesEntryShape: boolean;
  usesEntryBorder: boolean;
}

export interface GraphEdgeAttributes {
  edgeKind: GraphEdge["kind"];
  color: string;
  baseColor: string;
  size: number;
  baseSize: number;
}

export interface FallbackNode {
  id: string;
  label: string;
  filePath: string;
  startLine: number;
  x: number;
  y: number;
  color: string;
  type: GraphNode["type"];
}

interface FallbackEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  kind: GraphEdge["kind"];
}

export interface FallbackGraph {
  nodes: FallbackNode[];
  edges: FallbackEdge[];
}

export interface SelectionTraversal {
  selectedNodeId: string;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  orderedEdgeIds: string[];
  hopLayers: string[][];
  /** Maximum BFS hop depth applied when this traversal was computed (slice 022). */
  maxDepth: number;
}

/** A single result row shown in the SearchBar dropdown (slice 022). */
export interface SearchResultItem {
  nodeId: string;
  label: string;
  filePath: string;
  matchIndex: number;
}

/** Webview search state (slice 022). */
export interface SearchState {
  query: string;
  matchedNodeIds: Set<string>;
  results: SearchResultItem[];
  focusedIndex: number;
}

/** Webview depth-slider state (slice 022). */
export interface DepthState {
  depth: number;
  enabled: boolean;
}

/** Phase of the trace state machine (slice 023). */
export type TracePhase = "idle" | "picking-start" | "picking-end" | "path-active";

/**
 * Transient trace-mode state owned by GraphView. Not persisted.
 * `noPathFound` is set when the shortest-path query returns null;
 * `selfTraceError` is set when the user tries to use the same node as
 * both start and end.
 */
export interface TraceState {
  phase: TracePhase;
  startNodeId: string | null;
  endNodeId: string | null;
  pathNodeIds: string[];
  pathEdgeIds: string[];
  noPathFound: boolean;
  selfTraceError: boolean;
}

export const TRACE_STATE_IDLE: TraceState = {
  phase: "idle",
  startNodeId: null,
  endNodeId: null,
  pathNodeIds: [],
  pathEdgeIds: [],
  noPathFound: false,
  selfTraceError: false,
};

/** Derived from TraceState + graphology node attributes for TraceInspector (slice 023). */
export interface TracePath {
  startNodeId: string;
  endNodeId: string;
  hopCount: number;
  fileCount: number;
  layersCrossed: string[];
  crossesFrameworkBoundary: boolean;
  nodeIds: string[];
  edgeIds: string[];
}

export interface OverlaySegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  kind: GraphEdge["kind"];
  hopIndex: number;
}

export interface SigmaNodeDisplayData {
  x: number;
  y: number;
  hidden?: boolean;
}
