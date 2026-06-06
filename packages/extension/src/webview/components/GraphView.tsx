import type { GraphEdge } from "@dextree/core";
import {
  CLASSIFIED_LAYERS,
  countArchitectureNodes,
  rankLensMatches,
  type LensId,
  type RankableLensId,
} from "@dextree/core/lenses";
import { createNodeBorderProgram } from "@sigma/node-border";
import { NodeSquareProgram } from "@sigma/node-square";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { edgePathFromNodePath } from "graphology-shortest-path";
import { bidirectional } from "graphology-shortest-path/unweighted";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import { NodeCircleProgram } from "sigma/rendering";

import {
  applyLayoutPreset,
  LAYOUT_PRESET_OPTIONS,
  restoreNodePositions,
  snapshotNodePositions,
} from "./graphLayoutPresets.js";
import { computeHoverNeighborhood, type HoverNeighborhood } from "./graphHover.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { EdgeTypesPanel, type EdgeTypeEntry } from "./EdgeTypesPanel.js";
import { fitCameraToNodes, type NodeBoundsGraph } from "./cameraFit.js";
import {
  InspectorPanel,
  type InspectorNeighbor,
  type InspectorNeighbors,
} from "./InspectorPanel.js";
import { LENS_REGISTRY, LensesPanel } from "./LensesPanel.js";
import { LensResultTable, type LensResultRow } from "./LensResultTable.js";
import lensesPanelStyles from "./LensesPanel.module.css";
import {
  CANONICAL_NODE_FILTER_LIST,
  NodeFilterPanel,
  type NodeFilterEntry,
} from "./NodeFilterPanel.js";
import shellStyles from "./GraphView.module.css";
import { TraceBanner } from "./TraceBanner.js";
import { TraceInspector } from "./TraceInspector.js";
import { dimColor, layerColor } from "./lensColor.js";
import { drawClusterHulls, drawMinimap } from "./graphOverlay.js";
import { computeSelection, computeTracePath } from "./graphTraversal.js";
import { StaticGraphFallback } from "./StaticGraphFallback.js";
import {
  buildGraph,
  edgeColor,
  mixWithBackground,
  snapshotGraph,
  stabilizeFileAnchors,
  symbolColor,
  toFadedColor,
} from "./graphBuild.js";
import { createGraphViewStore } from "../state/graphViewStore.js";
import {
  TRACE_STATE_IDLE,
  type FallbackGraph,
  type GraphEdgeAttributes,
  type GraphNodeAttributes,
  type GraphViewProps,
  type LayoutPresetId,
  type LayoutSelectionState,
  type OverlaySegment,
  type SearchResultItem,
  type SelectionTraversal,
  type SigmaNodeDisplayData,
  type ThemeColors,
  type TracePhase,
  type TraceState,
} from "./graphViewTypes.js";

const SINGLE_CLICK_DELAY_MS = 180;
const CAMERA_CENTER_DURATION_MS = 380;
const FLOW_MAX_DEPTH = 4;
// Target camera ratio when flying to a search result — small enough to read
// the node clearly. Clamped so we only ever zoom in, never out.
const SEARCH_FLY_TO_RATIO = 0.5;

// Default GraphView focuses on the code-structure core: class/function/method/
// interface nodes connected by calls and imports. Every other type stays in the
// rail chips and can be toggled back on. Defaults are expressed as the hidden
// complement because the Sigma reducers filter by membership in the hidden set.
// Node keys are lowercase SymbolKind values (plus "file"); edge keys are the
// uppercase GraphEdgeKind values. IMPLEMENTS is omitted: it is a permanently
// "always shown" stub that the edge panel never lets the user hide.
const DEFAULT_HIDDEN_NODE_KINDS: readonly string[] = [
  "file",
  "property",
  "variable",
  "enum",
  "type",
  "decorator",
];
const DEFAULT_HIDDEN_EDGE_KINDS: ReadonlyArray<GraphEdge["kind"]> = [
  "DEFINES",
  "INHERITS",
  "INSTANTIATES",
];

// 2px is the smallest border that stays visible at the smallest rendered
// symbol-node size (5px). Fallback hex is muted gold; the live color comes
// from the `--vscode-charts-yellow` theme token via `readThemeColors`, so
// custom VS Code themes drive the entry styling and theme switches refresh
// it on the next render.
const ENTRY_BORDER_COLOR_FALLBACK = "#d4af37";
const ENTRY_BORDER_PIXELS = 2;

const NodeEntryProgram = createNodeBorderProgram({
  borders: [
    {
      color: { attribute: "entryBorderColor", defaultValue: ENTRY_BORDER_COLOR_FALLBACK },
      size: { value: ENTRY_BORDER_PIXELS, mode: "pixels" },
    },
    { color: { attribute: "color" }, size: { fill: true } },
  ],
});

type SigmaWithExtras = Sigma & {
  getNodeDisplayData?: (node: string) => SigmaNodeDisplayData | undefined;
  // NOTE: graphToViewport is NOT re-declared here — Sigma already exposes
  // graphToViewport(coords: {x,y}) on its prototype; do not shadow it.
  getCamera?: () => {
    animate?: (
      state: { x: number; y: number; ratio: number },
      options?: { duration?: number },
    ) => void;
    getState?: () => { x: number; y: number; ratio: number };
  };
};

function useReducedMotionPreference(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function canUseWebGL(): boolean {
  const canvas = document.createElement("canvas");

  try {
    return (
      canvas.getContext("webgl2") !== null ||
      canvas.getContext("webgl") !== null ||
      canvas.getContext("experimental-webgl") !== null
    );
  } catch {
    return false;
  }
}

function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.body);
  const foreground = styles.getPropertyValue("--vscode-foreground").trim();
  const classColor =
    styles.getPropertyValue("--vscode-symbolIcon-classForeground").trim() || foreground;
  const interfaceColor =
    styles.getPropertyValue("--vscode-symbolIcon-interfaceForeground").trim() || classColor;

  return {
    backgroundColor: styles.getPropertyValue("--vscode-editor-background").trim() || "transparent",
    labelColor: foreground,
    disabledColor:
      styles.getPropertyValue("--vscode-disabledForeground").trim() ||
      styles.getPropertyValue("--vscode-descriptionForeground").trim() ||
      foreground,
    fileNodeColor:
      styles.getPropertyValue("--vscode-symbolIcon-fileForeground").trim() || foreground,
    symbolKindColors: {
      default: classColor,
      function:
        styles.getPropertyValue("--vscode-symbolIcon-functionForeground").trim() || foreground,
      class: classColor,
      interface: interfaceColor,
      enum: styles.getPropertyValue("--vscode-symbolIcon-enumForeground").trim() || classColor,
      variable:
        styles.getPropertyValue("--vscode-symbolIcon-variableForeground").trim() || foreground,
      type: interfaceColor || classColor,
      method:
        styles.getPropertyValue("--vscode-symbolIcon-methodForeground").trim() ||
        styles.getPropertyValue("--vscode-symbolIcon-functionForeground").trim() ||
        foreground,
    },
    definesEdgeColor: styles.getPropertyValue("--vscode-charts-blue").trim() || foreground,
    importsEdgeColor: styles.getPropertyValue("--vscode-charts-green").trim() || foreground,
    callsEdgeColor: styles.getPropertyValue("--vscode-charts-orange").trim() || foreground,
    inheritsEdgeColor: styles.getPropertyValue("--vscode-charts-purple").trim() || foreground,
    instantiatesEdgeColor: styles.getPropertyValue("--vscode-charts-red").trim() || foreground,
    // Slice 023 — trace path edge color. Reuses the chart yellow if defined;
    // falls back to a static yellow that survives all known VS Code themes.
    tracePathEdgeColor: styles.getPropertyValue("--vscode-charts-yellow").trim() || "#dcdcaa",
    // Direction-aware CALLS emphasis for the selected node: callers (inbound)
    // vs callees (outbound) get distinct hues so "who calls me" reads apart from
    // "what I call".
    callerEdgeColor: styles.getPropertyValue("--vscode-charts-green").trim() || foreground,
    calleeEdgeColor: styles.getPropertyValue("--vscode-charts-orange").trim() || foreground,
    entryBorderColor:
      styles.getPropertyValue("--vscode-charts-yellow").trim() || ENTRY_BORDER_COLOR_FALLBACK,
  };
}

function createOverlaySegments(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  selection: SelectionTraversal | null,
): OverlaySegment[] {
  if (selection === null) {
    return [];
  }

  const sigmaWithExtras = sigma as SigmaWithExtras;
  const getNodeDisplayData = sigmaWithExtras.getNodeDisplayData;

  if (typeof getNodeDisplayData !== "function") {
    return [];
  }

  // Build edgeId → hopIndex map from depth-bucketed BFS layers
  const edgeHopIndex = new Map<string, number>();
  for (const [idx, layer] of selection.hopLayers.entries()) {
    for (const edgeId of layer) {
      edgeHopIndex.set(edgeId, idx);
    }
  }

  const segments: OverlaySegment[] = [];

  for (const edgeId of selection.orderedEdgeIds.slice(0, 24)) {
    const sourceId = graph.source(edgeId);
    const targetId = graph.target(edgeId);
    const source = getNodeDisplayData.call(sigmaWithExtras, sourceId);
    const target = getNodeDisplayData.call(sigmaWithExtras, targetId);

    if (
      source === undefined ||
      target === undefined ||
      source.hidden ||
      target.hidden ||
      !Number.isFinite(source.x) ||
      !Number.isFinite(source.y) ||
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y)
    ) {
      continue;
    }

    segments.push({
      id: edgeId,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      color: String(graph.getEdgeAttribute(edgeId, "baseColor")),
      kind: graph.getEdgeAttribute(edgeId, "edgeKind") as GraphEdge["kind"],
      hopIndex: edgeHopIndex.get(edgeId) ?? 0,
    });
  }

  return segments;
}

function applySigmaSetting(sigma: Sigma, key: string, value: unknown): void {
  (sigma as unknown as { setSetting: (setting: string, nextValue: unknown) => void }).setSetting(
    key,
    value,
  );
}

function refreshSigma(sigma: Sigma): void {
  const maybeRefresh = sigma as unknown as { refresh?: () => void };
  maybeRefresh.refresh?.();
}

/**
 * Format a lens ranking metric for the result table. Integer-valued metrics
 * (fan-out / fan-in counts) render as integers; fractional metrics (PageRank
 * importance) render to 3 decimals so distinct scores stay distinguishable.
 */
function formatLensMetric(metric: number): string {
  return Number.isInteger(metric) ? String(metric) : metric.toFixed(3);
}

function applyTheme(graph: MultiDirectedGraph, sigma: Sigma, container: HTMLDivElement): void {
  const colors = readThemeColors();

  container.style.backgroundColor = colors.backgroundColor;

  graph.forEachNode((node, attributes) => {
    const nextColor =
      attributes.nodeKind === "file"
        ? colors.fileNodeColor
        : symbolColor(
            {
              id: node,
              type: attributes.nodeKind,
              label: attributes.label,
              filePath: attributes.filePath,
              startLine: attributes.startLine,
              symbolKind: attributes.symbolKind,
            },
            colors,
          );

    graph.mergeNodeAttributes(node, {
      color: nextColor,
      baseColor: nextColor,
    });
  });

  graph.forEachEdge((edge, attributes) => {
    const kind = attributes.edgeKind as GraphEdge["kind"];
    const rawColor = edgeColor(kind, colors);
    const color =
      kind === "IMPORTS" ? mixWithBackground(rawColor, colors.backgroundColor, 0.72) : rawColor;
    graph.mergeEdgeAttributes(edge, {
      color,
      baseColor: rawColor,
    });
  });

  applySigmaSetting(sigma, "labelColor", { color: colors.labelColor });
  applySigmaSetting(sigma, "defaultNodeColor", colors.symbolKindColors.default);
  applySigmaSetting(sigma, "defaultEdgeColor", colors.definesEdgeColor);
  refreshSigma(sigma);
}

export function GraphView({
  nodes,
  edges,
  onNavigate,
  onExportMermaid,
  onExportCurrentView: _onExportCurrentView,
  onExportTraceSequence,
  workspaceName,
  workspaceFrameworks,
  onWorkspaceSwitcherClick,
  onReindex,
  onClearWorkspace,
  onClearAll,
  onToggleSourceOnly,
  sourceOnly,
  isIndexing,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<MultiDirectedGraph | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoverRef = useRef<HoverNeighborhood | null>(null);
  const hoverSelectionRef = useRef<SelectionTraversal | null>(null);
  const selectionRef = useRef<SelectionTraversal | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  // Tracks last single-click for manual double-click detection on nodes.
  // Sigma 3's "doubleClickNode" can miss if WebGL picking fails on rapid 2nd click.
  const lastClickRef = useRef<{ node: string; time: number } | null>(null);
  const clusterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotionPreference();
  // Single source of truth for the view-membership primitives. The imperative
  // Sigma reducers read these via `graphViewStoreRef.current.getState()` (they
  // cannot subscribe to React re-renders); the React state below remains the
  // panel-facing copy and is mirrored into this store on change.
  const graphViewStoreRef = useRef(
    createGraphViewStore({
      hiddenNodeKinds: new Set(DEFAULT_HIDDEN_NODE_KINDS),
      hiddenEdgeKinds: new Set(DEFAULT_HIDDEN_EDGE_KINDS),
    }),
  );

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [fallbackGraph, setFallbackGraph] = useState<FallbackGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [overlaySegments, setOverlaySegments] = useState<OverlaySegment[]>([]);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showClusterHulls, setShowClusterHulls] = useState(true);
  const showClusterHullsRef = useRef(true);
  const [hiddenEdgeKinds, setHiddenEdgeKinds] = useState<Set<GraphEdge["kind"]>>(
    () => new Set(DEFAULT_HIDDEN_EDGE_KINDS),
  );
  // Slice 025 — layout preset selection. ForceAtlas2 is the session default
  // for every fresh GraphView open per FR-003; preset state is local to this
  // component and never persisted or sent to the extension host.
  const [layoutSelection, setLayoutSelection] = useState<LayoutSelectionState>({
    activePreset: "forceAtlas2",
    notice: null,
  });

  const handleSelectLayoutPreset = useCallback(
    (preset: LayoutPresetId) => {
      const graph = graphRef.current;
      if (graph === null) {
        // Graph not initialised yet — nothing to lay out.
        return;
      }

      // Whole-graph visibility for slice 025. Filter-aware visibility can
      // be plumbed in later if a filter-active preset run produces awkward
      // results; until then noverlap operates on every node, but only the
      // currently rendered ones impact the user-visible arrangement.
      const visibleNodeIds = new Set<string>(graph.nodes());
      const visibleEdgeIds = new Set<string>(graph.edges());

      // Snapshot the prior coordinates before any Hierarchical attempt so
      // we can restore them if the DAG suitability check rejects (FR-009).
      // Other presets don't need this — they either apply or no-op without
      // ever touching coordinates.
      const snapshot = preset === "hierarchical" ? snapshotNodePositions(graph) : null;

      const result = applyLayoutPreset(graph, preset, {
        activePreset: layoutSelection.activePreset,
        visibleNodeIds,
        visibleEdgeIds,
      });

      if (result.status === "applied") {
        setLayoutSelection({ activePreset: result.preset, notice: null });
        const sigma = sigmaRef.current;
        sigma?.refresh();
        // A preset can move nodes into a coordinate range outside the current
        // camera view (Hierarchical's origin-centred layers, Circular's ring),
        // which would leave the canvas looking empty. Re-frame the new layout.
        const container = containerRef.current;
        if (sigma !== null && container !== null) {
          fitCameraToNodes(
            sigma as SigmaWithExtras,
            container,
            graph as unknown as NodeBoundsGraph,
          );
        }
        return;
      }

      if (result.status === "rejected") {
        // Restore prior coordinates as a defensive measure even though the
        // helper currently rejects before mutating — keeps the contract
        // promise that a failed attempt preserves the previous layout.
        if (snapshot !== null) {
          restoreNodePositions(graph, snapshot);
        }
        setLayoutSelection({
          activePreset: layoutSelection.activePreset,
          notice: result.notice,
        });
        return;
      }

      // status === "noop" — re-selecting the active preset or trivial graph.
      // Don't touch state so the toolbar value remains stable.
    },
    [layoutSelection.activePreset],
  );

  // Auto-dismiss the Hierarchical fallback notice after a few seconds so it
  // stays non-blocking (FR-009). New notices replace older ones immediately
  // because setLayoutSelection always re-runs this effect with a new value.
  useEffect(() => {
    if (layoutSelection.notice === null) return undefined;
    const handle = window.setTimeout(() => {
      setLayoutSelection((prev) => (prev.notice === null ? prev : { ...prev, notice: null }));
    }, 6000);
    return () => window.clearTimeout(handle);
  }, [layoutSelection.notice]);
  const [hiddenNodeKinds, setHiddenNodeKinds] = useState<Set<string>>(
    () => new Set(DEFAULT_HIDDEN_NODE_KINDS),
  );
  // Slice 031 US3 — set of node IDs that carry the "decorator-backed" flag,
  // so the Sigma node reducer can hide them when the Decorator chip is off.
  const decoratorBackedNodeIdsRef = useRef<Set<string>>(new Set());
  const [activeLensId, setActiveLensId] = useState<LensId | null>(null);
  const lensMatchSetRef = useRef<ReadonlySet<string> | null>(null);
  const lensColorOfRef = useRef<((archLayer: string | undefined) => string | null) | null>(null);
  // Search state (slice 022). `searchQuery` is the committed (post-debounce)
  // value; the SearchBar manages its own pending input internally.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchFocusedIndex, setSearchFocusedIndex] = useState<number>(0);
  const matchedNodeIdsRef = useRef<Set<string>>(new Set());
  // Depth slider state (slice 022). Default 3 per spec FR-005.
  const [depth, setDepth] = useState<number>(3);
  // Trace state (slice 023). Tracks the trace state machine and the
  // resolved path. `tracePhaseRef` mirrors `traceState.phase` so the
  // Sigma clickNode callback can route clicks without being re-registered.
  const [traceState, setTraceState] = useState<TraceState>(TRACE_STATE_IDLE);
  const tracePhaseRef = useRef<TracePhase>("idle");
  const pathNodeIdsRef = useRef<Set<string>>(new Set());
  const pathEdgeIdsRef = useRef<Set<string>>(new Set());

  const onToggleMinimap = useCallback(() => {
    setShowMinimap((visible) => !visible);
  }, []);

  const onToggleClusterHulls = useCallback(() => {
    setShowClusterHulls((visible) => {
      showClusterHullsRef.current = !visible;
      return !visible;
    });
    const cc = clusterCanvasRef.current;
    if (cc !== null) {
      const ctx = cc.getContext("2d");
      if (!showClusterHullsRef.current) ctx?.clearRect(0, 0, cc.width, cc.height);
      else sigmaRef.current?.refresh();
    }
  }, []);

  // Compute counts for all five lenses against the current subgraph. Stub
  // lenses (selector === null) contribute 0. Runs once per subgraph change.
  const lensCounts = useMemo<Record<LensId, number>>(() => {
    const graph = graphRef.current;
    const empty: Record<LensId, number> = {
      "god-function": 0,
      "god-class": 0,
      "most-used": 0,
      "least-used": 0,
      "dead-code": 0,
      "entry-points": 0,
      architecture: 0,
    };
    if (graph === null) return empty;
    const out = { ...empty };
    for (const id of Object.keys(LENS_REGISTRY) as LensId[]) {
      const mode = LENS_REGISTRY[id].mode;
      out[id] =
        mode.kind === "match" ? mode.selector(graph, nodes).size : countArchitectureNodes(nodes);
    }
    return out;
  }, [nodes]);

  // Compute the set of node IDs the active lens matches. Recomputes when the
  // user switches lenses or the subgraph changes. `null` means no lens active
  // OR the active lens is a recolour lens (which dims nothing).
  const lensMatchSet = useMemo<ReadonlySet<string> | null>(() => {
    if (activeLensId === null) return null;
    const graph = graphRef.current;
    if (graph === null) return null;
    const mode = LENS_REGISTRY[activeLensId].mode;
    if (mode.kind !== "match") return null;
    return mode.selector(graph, nodes);
  }, [activeLensId, nodes]);

  // The active recolour lens's colour fn, or null when no recolour lens is
  // active. Drives the node reducer's recolour branch.
  const lensColorOf = useMemo<((archLayer: string | undefined) => string | null) | null>(() => {
    if (activeLensId === null) return null;
    const mode = LENS_REGISTRY[activeLensId].mode;
    return mode.kind === "recolor" ? mode.colorOf : null;
  }, [activeLensId]);

  const onLensToggle = useCallback((id: LensId) => {
    setActiveLensId((current) => (current === id ? null : id));
  }, []);

  // Ranked result rows for the active rankable lens (architecture recolours and
  // has no table). Enriches the core `rankLensMatches` output with display
  // labels and a formatted metric. Recomputes when the lens or graph changes.
  const lensResultRows = useMemo<LensResultRow[] | null>(() => {
    if (activeLensId === null || activeLensId === "architecture") return null;
    const graph = graphRef.current;
    if (graph === null) return null;
    const labelById = new Map(nodes.map((n) => [n.id, n.label]));
    return rankLensMatches(activeLensId as RankableLensId, graph, nodes).map((row) => ({
      nodeId: row.nodeId,
      label: labelById.get(row.nodeId) ?? row.nodeId,
      metric: row.metric === null ? null : formatLensMetric(row.metric),
    }));
  }, [activeLensId, nodes]);

  // Search results (slice 022). Case-insensitive substring match on label +
  // filePath. `fqn` is referenced in the spec but not yet present on GraphNode;
  // falls back gracefully (always-undefined) per FR-005 / CC-003.
  const searchResults = useMemo<SearchResultItem[]>(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const needle = trimmed.toLowerCase();
    const out: SearchResultItem[] = [];
    for (const node of nodes) {
      const labelLower = node.label.toLowerCase();
      const filePathLower = node.filePath.toLowerCase();
      const labelHit = labelLower.indexOf(needle);
      const filePathHit = filePathLower.indexOf(needle);
      const matchIndex = labelHit >= 0 ? labelHit : filePathHit;
      if (matchIndex < 0) {
        continue;
      }
      out.push({
        nodeId: node.id,
        label: node.label,
        filePath: node.filePath,
        matchIndex,
      });
    }
    return out;
  }, [nodes, searchQuery]);

  const matchedNodeIds = useMemo<Set<string>>(() => {
    return new Set(searchResults.map((r) => r.nodeId));
  }, [searchResults]);

  // Depth slider is enabled only when there's something to expand from —
  // either an explicit selection or a search match set.
  const depthEnabled = selectedNodeId !== null || matchedNodeIds.size > 0;

  const handleSearchQueryChange = useCallback((next: string): void => {
    setSearchQuery(next);
    setSearchFocusedIndex(0);
  }, []);

  // Select a node (highlight + neighbourhood + Inspector) the same way a canvas
  // single-click does, then fly the camera to it with a zoom so the move is
  // obvious. `selectNode` lives in the Sigma effect closure, so the state writes
  // are replicated here. Shared by search-result and lens-row selection.
  const selectAndFlyToNode = useCallback((nodeId: string): void => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (graph === null || !graph.hasNode(nodeId)) return;
    setSelectedNodeId(nodeId);
    selectionRef.current = computeSelection(graph, nodeId, FLOW_MAX_DEPTH);
    if (sigma !== null) refreshSigma(sigma);

    // Fly + zoom in (keeping the prior ratio made the pan imperceptible on a
    // zoomed-out graph). Clamp so we only ever zoom in, never out.
    const camera = (sigma as SigmaWithExtras | null)?.getCamera?.();
    const x = graph.getNodeAttribute(nodeId, "x") as number | undefined;
    const y = graph.getNodeAttribute(nodeId, "y") as number | undefined;
    if (camera?.animate !== undefined && typeof x === "number" && typeof y === "number") {
      const currentRatio = camera.getState?.().ratio ?? 1;
      const ratio = Math.min(currentRatio, SEARCH_FLY_TO_RATIO);
      camera.animate({ x, y, ratio }, { duration: CAMERA_CENTER_DURATION_MS });
    }
  }, []);

  const handleSearchSelectResult = useCallback(
    (nodeId: string, index: number): void => {
      setSearchFocusedIndex(index);
      selectAndFlyToNode(nodeId);
      // Open the file at the symbol's line. Works even when the node lacks
      // coordinates (selectAndFlyToNode still selects) or is missing from the
      // live graph — we navigate from the search result's own data.
      const target = nodes.find((n) => n.id === nodeId);
      if (target !== undefined) {
        onNavigate(target.filePath, target.startLine);
      }
    },
    [nodes, onNavigate, selectAndFlyToNode],
  );

  const handleSearchClear = useCallback((): void => {
    setSearchQuery("");
    setSearchFocusedIndex(0);
  }, []);

  const handleDepthChange = useCallback((next: number): void => {
    setDepth(next);
  }, []);

  // Trace mode handlers (slice 023).
  const handleTraceToggle = useCallback((): void => {
    setTraceState((current) => {
      if (current.phase !== "idle") {
        tracePhaseRef.current = "idle";
        return TRACE_STATE_IDLE;
      }
      // Entering trace mode clears search + depth so the full graph is
      // visible for node picking (spec FR-010).
      setSearchQuery("");
      setSearchFocusedIndex(0);
      setDepth(3);
      tracePhaseRef.current = "picking-start";
      return { ...TRACE_STATE_IDLE, phase: "picking-start" };
    });
  }, []);

  const handleTraceExit = useCallback((): void => {
    tracePhaseRef.current = "idle";
    setTraceState(TRACE_STATE_IDLE);
  }, []);

  // Zoom handlers (slice 033 US3).
  const handleZoomIn = useCallback((): void => {
    const sigma = sigmaRef.current;
    const camera = (sigma as SigmaWithExtras).getCamera?.();
    const state = camera?.getState?.();
    if (camera?.animate !== undefined && state !== undefined) {
      camera.animate({ x: state.x, y: state.y, ratio: state.ratio * 0.7 }, { duration: 200 });
    }
  }, []);

  const handleZoomOut = useCallback((): void => {
    const sigma = sigmaRef.current;
    const camera = (sigma as SigmaWithExtras).getCamera?.();
    const state = camera?.getState?.();
    if (camera?.animate !== undefined && state !== undefined) {
      camera.animate({ x: state.x, y: state.y, ratio: state.ratio * 1.4 }, { duration: 200 });
    }
  }, []);

  const handleZoomFit = useCallback((): void => {
    const sigma = sigmaRef.current;
    const container = containerRef.current;
    const g = graphRef.current;
    if (sigma === null || container === null || g === null) return;
    fitCameraToNodes(sigma as SigmaWithExtras, container, g as unknown as NodeBoundsGraph);
  }, []);

  const handleZoomReset = useCallback((): void => {
    const sigma = sigmaRef.current;
    const camera = (sigma as SigmaWithExtras).getCamera?.();
    camera?.animate?.({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 300 });
  }, []);

  // Filter toggles (slice 033 US2). The hidden-kind sets already drive the
  // Sigma node/edge reducers via their refs; these handlers expose the toggle
  // to the left/right rail filter panels. A toggle that adds the kind hides
  // it; removing the kind shows it again.
  const handleToggleNodeKind = useCallback((key: string): void => {
    setHiddenNodeKinds((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleEdgeKind = useCallback((kind: string): void => {
    setHiddenEdgeKinds((current) => {
      const next = new Set(current) as Set<GraphEdge["kind"]>;
      const typed = kind as GraphEdge["kind"];
      if (next.has(typed)) {
        next.delete(typed);
      } else {
        next.add(typed);
      }
      return next;
    });
  }, []);

  const handleTracePathCompute = useCallback((startId: string, endId: string): void => {
    const graph = graphRef.current;
    if (graph === null || !graph.hasNode(startId) || !graph.hasNode(endId)) {
      return;
    }
    const nodePath = bidirectional(graph, startId, endId);
    if (nodePath === null) {
      tracePhaseRef.current = "path-active";
      setTraceState({
        phase: "path-active",
        startNodeId: startId,
        endNodeId: endId,
        pathNodeIds: [],
        pathEdgeIds: [],
        noPathFound: true,
        selfTraceError: false,
      });
      return;
    }
    const edgePath = edgePathFromNodePath(graph, nodePath);
    tracePhaseRef.current = "path-active";
    setTraceState({
      phase: "path-active",
      startNodeId: startId,
      endNodeId: endId,
      pathNodeIds: nodePath,
      pathEdgeIds: edgePath,
      noPathFound: false,
      selfTraceError: false,
    });
  }, []);

  const handleTraceNodeClick = useCallback(
    (nodeId: string): void => {
      setTraceState((current) => {
        if (current.phase === "picking-start") {
          tracePhaseRef.current = "picking-end";
          return {
            ...TRACE_STATE_IDLE,
            phase: "picking-end",
            startNodeId: nodeId,
          };
        }
        if (current.phase === "picking-end") {
          if (current.startNodeId === nodeId) {
            // Self-trace — flag the error, stay in picking-end.
            return { ...current, selfTraceError: true };
          }
          // Schedule path compute outside the setter (which must stay pure).
          // We do this by returning early and dispatching via microtask.
          queueMicrotask(() => handleTracePathCompute(current.startNodeId!, nodeId));
          return current;
        }
        return current;
      });
    },
    [handleTracePathCompute],
  );

  /**
   * "Trace from here" entry point (slice 023 US3). Pre-fills the trace start
   * with the given node id and transitions directly to picking-end. Clears
   * search + depth like the toolbar toggle does.
   */
  const handleTraceFromHere = useCallback((nodeId: string): void => {
    setSearchQuery("");
    setSearchFocusedIndex(0);
    setDepth(3);
    tracePhaseRef.current = "picking-end";
    setTraceState({
      ...TRACE_STATE_IDLE,
      phase: "picking-end",
      startNodeId: nodeId,
    });
  }, []);

  /** Animate the Sigma camera to the given node (slice 023 trace-step click). */
  const handleTraceStepClick = useCallback((nodeId: string): void => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (sigma === null || graph === null || !graph.hasNode(nodeId)) {
      return;
    }
    const sigmaWithExtras = sigma as SigmaWithExtras;
    const camera = sigmaWithExtras.getCamera?.();
    if (camera?.animate === undefined) {
      return;
    }
    const x = graph.getNodeAttribute(nodeId, "x") as number | undefined;
    const y = graph.getNodeAttribute(nodeId, "y") as number | undefined;
    if (typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const currentRatio = camera.getState?.().ratio ?? 1;
    camera.animate({ x, y, ratio: currentRatio }, { duration: CAMERA_CENTER_DURATION_MS });
  }, []);

  useEffect(() => {
    setSelectedNodeId(null);
    selectionRef.current = null;
    hoverRef.current = null;
    hoverSelectionRef.current = null;
    lastClickRef.current = null;
    setOverlaySegments([]);
  }, [edges, nodes]);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const colors = readThemeColors();
    const graph = buildGraph(nodes, edges, colors);
    const canceledRef = { current: false };

    // Degree-based size boost: hub nodes (high connectivity) render larger so
    // important call-sites and widely-imported files stand out visually.
    graph.forEachNode((nodeId) => {
      const degree = graph.degree(nodeId);
      if (degree > 1) {
        const boost = Math.min((degree - 1) * 0.35, 4);
        const s = Number(graph.getNodeAttribute(nodeId, "baseSize")) + boost;
        graph.mergeNodeAttributes(nodeId, { size: s, baseSize: s });
      }
    });

    graphRef.current = graph;

    const buildFallbackGraph = () => snapshotGraph(graph);
    const updateOverlay = (): void => {
      const activeGraph = graphRef.current;
      const sigma = sigmaRef.current;

      if (activeGraph === null || sigma === null) {
        setOverlaySegments([]);
        return;
      }

      setOverlaySegments(createOverlaySegments(activeGraph, sigma, selectionRef.current));
    };

    let sigma: Sigma | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const enterNodeListener = (event: { node: string }): void => {
      hoveredNodeIdRef.current = event.node;
      hoverRef.current = computeHoverNeighborhood(graph, event.node);
      hoverSelectionRef.current = computeSelection(graph, event.node, FLOW_MAX_DEPTH);
      if (sigma !== null) {
        refreshSigma(sigma);
        // Show animated edge overlay on hover when nothing is selected
        if (selectionRef.current === null) {
          setOverlaySegments(
            createOverlaySegments(graphRef.current ?? graph, sigma, hoverSelectionRef.current),
          );
        }
      }
    };

    const leaveNodeListener = (): void => {
      hoveredNodeIdRef.current = null;
      hoverRef.current = null;
      hoverSelectionRef.current = null;
      if (sigma !== null) {
        refreshSigma(sigma);
        // Restore selection overlay or clear
        if (selectionRef.current === null) {
          setOverlaySegments([]);
        } else {
          setOverlaySegments(
            createOverlaySegments(graphRef.current ?? graph, sigma, selectionRef.current),
          );
        }
      }
    };

    const navigateToNode = (nodeId: string): void => {
      const attributes = graph.getNodeAttributes(nodeId) as GraphNodeAttributes;
      onNavigate(attributes.filePath, attributes.startLine);
    };

    const selectNode = (nodeId: string): void => {
      setSelectedNodeId(nodeId);
      selectionRef.current = computeSelection(graph, nodeId, FLOW_MAX_DEPTH);

      // Selecting highlights the node + its neighborhood and opens the inspector,
      // but deliberately does NOT recenter the camera — an auto-pan on every
      // click makes the graph jump under the cursor. The viewport only moves on
      // explicit Fit / search-result navigation.
      if (sigma !== null) {
        refreshSigma(sigma);
        updateOverlay();
      }
    };

    const clearSelection = (): void => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      setSelectedNodeId(null);
      selectionRef.current = null;
      setOverlaySegments([]);

      if (sigma !== null) {
        refreshSigma(sigma);
      }
    };

    if (!canUseWebGL()) {
      sigmaRef.current = null;
      if (canceledRef.current) return;
      if (canceledRef.current) return;
      setError(null);
      setFallbackGraph(buildFallbackGraph());
      return () => {
        graphRef.current = null;
      };
    }

    try {
      if (graph.order > 0) {
        try {
          forceAtlas2.assign(graph, {
            iterations: 200,
            settings: {
              gravity: 1.8,
              scalingRatio: 6,
              slowDown: 3,
              barnesHutOptimize: true,
              barnesHutTheta: 0.5,
              linLogMode: true,
            },
          });
          stabilizeFileAnchors(graph);
        } catch (layoutError) {
          console.error("Dextree graph layout failed", layoutError);
        }
      }

      sigma = new Sigma(graph, container, {
        allowInvalidContainer: true,
        renderLabels: true,
        renderEdgeLabels: false,
        // Labels are hidden for tiny/distant nodes and revealed as the user zooms in.
        // File nodes (size 14-32) remain labelled at all zoom levels; small symbol
        // nodes (size 5-15) only show labels once they appear ≥ 4 screen-pixels wide.
        labelRenderedSizeThreshold: 4,
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        defaultEdgeColor: colors.definesEdgeColor,
        enableEdgeEvents: true,
        // Prevent built-in double-click zoom — navigation is handled manually via clickNode.
        doubleClickZoomingRatio: 1,
        // Explicitly include circle (replacing nodeProgramClasses overrides the
        // default mapping in Sigma 3). Square is registered for upcoming
        // architectural-layer differentiation in later slices; entry is the
        // gold-bordered classification treatment from slice 026.
        nodeProgramClasses: {
          circle: NodeCircleProgram,
          square: NodeSquareProgram,
          entry: NodeEntryProgram,
        },
        nodeReducer: (node, data) => {
          // View-membership inputs come from the store (single source of truth);
          // the imperative reducer reads them live via getState() each call.
          const hiddenNodeKinds = graphViewStoreRef.current.getState().hiddenNodeKinds;

          // 1. Node-kind filter (applied first — hides node before hover/focus logic runs)
          const attrs = data as GraphNodeAttributes;
          const kindKey = attrs.nodeKind === "file" ? "file" : (attrs.symbolKind ?? "function");
          if (hiddenNodeKinds.has(kindKey)) {
            return { ...data, hidden: true };
          }
          // Slice 031 US3 — Decorator chip semantics. When the user clicks the
          // Decorator chip off, decorator-backed nodes are hidden the same way
          // any other node-kind filter hides nodes.
          if (hiddenNodeKinds.has("decorator") && decoratorBackedNodeIdsRef.current.has(node)) {
            return { ...data, hidden: true };
          }

          // 2. Depth filter (slice 022) — hide nodes outside the depth-N
          // neighbourhood of the selected/matched anchor(s).
          const depthVisible = depthVisibleNodeIdsRef.current;
          if (depthVisible !== null && !depthVisible.has(node)) {
            return { ...data, hidden: true };
          }

          // 3. Trace dimming (slice 023) — when a trace path is active,
          // off-path nodes are dimmed. Trace dimming wins over search/lens.
          if (tracePhaseRef.current === "path-active" && pathNodeIdsRef.current.size > 0) {
            if (!pathNodeIdsRef.current.has(node)) {
              return {
                ...data,
                color: dimColor(String(data.color)),
                label: "",
              };
            }
            return data;
          }

          const hover = hoverRef.current;
          const selection = selectionRef.current;
          const activeFocus = hover ?? selection;

          if (activeFocus === null || activeFocus.nodeIds.has(node)) {
            if (selection !== null && hover === null && selection.selectedNodeId === node) {
              return {
                ...data,
                size: Number(data.baseSize ?? data.size) * 1.28,
                zIndex: 2,
              };
            }

            // No hover/selection focus — apply search dimming first
            // (slice 022), then lens dimming (slice 021).  User focus always
            // wins over both.
            if (activeFocus === null) {
              const matched = matchedNodeIdsRef.current;
              if (matched.size > 0 && !matched.has(node)) {
                return {
                  ...data,
                  color: dimColor(String(data.color)),
                  label: "",
                };
              }
              const lensMatchSet = lensMatchSetRef.current;
              if (lensMatchSet !== null && !lensMatchSet.has(node)) {
                return {
                  ...data,
                  color: dimColor(String(data.color)),
                };
              }
              // Architecture (recolour) lens — recolour by layer instead of
              // dimming. A null result means "keep base colour" (unknown layer).
              const colorOf = lensColorOfRef.current;
              if (colorOf !== null) {
                const layerColorValue = colorOf(data.archLayer as string | undefined);
                if (layerColorValue !== null) {
                  return {
                    ...data,
                    color: layerColorValue,
                  };
                }
              }
            }

            return data;
          }

          return {
            ...data,
            color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
            label: "",
          };
        },
        edgeReducer: (edge, data) => {
          const hover = hoverRef.current;
          const selection = selectionRef.current;
          const edgeAttrs = data as GraphEdgeAttributes;

          // Hide edges whose kind is toggled off by the filter bar. Read from
          // the store (single source of truth) live on each reducer call.
          if (graphViewStoreRef.current.getState().hiddenEdgeKinds.has(edgeAttrs.edgeKind)) {
            return { ...data, hidden: true };
          }

          // Trace path styling (slice 023) — on-path edges render as a bold
          // yellow; off-path edges are dimmed. Wins over hover/selection.
          // Distinction is carried by colour + size, not an edge `type`: only
          // the "line" program is registered, and Sigma throws on an unknown
          // edge type (e.g. "dashed") the moment it has to render one.
          if (tracePhaseRef.current === "path-active" && pathEdgeIdsRef.current.size > 0) {
            if (pathEdgeIdsRef.current.has(edge)) {
              return {
                ...data,
                color: colors.tracePathEdgeColor,
                size: Number(data.baseSize ?? data.size) * 1.6,
                zIndex: 1,
              };
            }
            return {
              ...data,
              color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
              size: Math.max(Number(data.baseSize ?? data.size) * 0.6, 1),
            };
          }

          const activeFocus = hover ?? selection;

          if (activeFocus === null || activeFocus.edgeIds.has(edge)) {
            if (selection !== null && hover === null && selection.edgeIds.has(edge)) {
              const emphasised = {
                ...data,
                size: Number(data.baseSize ?? data.size) * 1.34,
                zIndex: 1,
              };
              // Direction-aware CALLS emphasis: colour a selected node's inbound
              // calls (callers) distinctly from its outbound calls (callees).
              // Only `color`/`size` are touched — the edge keeps the registered
              // "line" program (Sigma throws on an unregistered edge `type`).
              if (edgeAttrs.edgeKind === "CALLS") {
                const selectedId = selection.selectedNodeId;
                if (graph.target(edge) === selectedId) {
                  return { ...emphasised, color: colors.callerEdgeColor };
                }
                if (graph.source(edge) === selectedId) {
                  return { ...emphasised, color: colors.calleeEdgeColor };
                }
              }
              return emphasised;
            }

            return data;
          }

          return {
            ...data,
            color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
            size: Math.max(Number(data.baseSize ?? data.size) * 0.72, 1),
          };
        },
      });

      sigmaRef.current = sigma;
      applyTheme(graph, sigma, container);
      if (canceledRef.current) {
        sigma.kill();
        sigmaRef.current = null;
        return;
      }
      setFallbackGraph(null);
      setOverlaySegments([]);

      resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const cc = clusterCanvasRef.current;
        if (cc !== null) {
          cc.width = w;
          cc.height = h;
        }
        if (sigma !== null) {
          refreshSigma(sigma);
          updateOverlay();
        }
      });
      resizeObserver.observe(container);

      sigma.on("clickNode", (event) => {
        // Trace mode takes priority over normal selection (slice 023). When a
        // trace phase is waiting for a node pick, route the click to the
        // trace state machine and short-circuit normal selection.
        if (tracePhaseRef.current === "picking-start" || tracePhaseRef.current === "picking-end") {
          handleTraceNodeClick(event.node);
          return;
        }
        // Queue single-click selection; doubleClickNode cancels this if a double-click fires.
        if (clickTimeoutRef.current !== null) {
          window.clearTimeout(clickTimeoutRef.current);
        }
        lastClickRef.current = { node: event.node, time: Date.now() };
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickRef.current = null;
          selectNode(event.node);
        }, SINGLE_CLICK_DELAY_MS);
      });

      // doubleClickNode is the reliable Sigma 3 event for actual double-clicks.
      // We prevent the built-in zoom and navigate to the node instead.
      sigma.on("doubleClickNode", (event) => {
        // Cancel the pending single-click selection
        if (clickTimeoutRef.current !== null) {
          window.clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        lastClickRef.current = null;

        // Prevent Sigma's built-in double-click zoom
        const preventable = event as unknown as { preventSigmaDefault?: () => void };
        preventable.preventSigmaDefault?.();

        navigateToNode(event.node);
      });

      sigma.on("clickStage", () => {
        clearSelection();
      });

      sigma.on("enterNode", enterNodeListener);
      sigma.on("leaveNode", leaveNodeListener);

      sigma.on("afterRender", () => {
        try {
          const cc = clusterCanvasRef.current;
          if (cc !== null) {
            if (!showClusterHullsRef.current) {
              cc.getContext("2d")?.clearRect(0, 0, cc.width, cc.height);
            } else {
              const hoveredFilePath =
                hoveredNodeIdRef.current !== null && graph.hasNode(hoveredNodeIdRef.current)
                  ? String(
                      (graph.getNodeAttributes(hoveredNodeIdRef.current) as GraphNodeAttributes)
                        .filePath,
                    )
                  : null;
              const selectedFilePath =
                selectionRef.current !== null && graph.hasNode(selectionRef.current.selectedNodeId)
                  ? String(
                      (
                        graph.getNodeAttributes(
                          selectionRef.current.selectedNodeId,
                        ) as GraphNodeAttributes
                      ).filePath,
                    )
                  : null;
              drawClusterHulls(graph, sigma!, cc, hoveredFilePath, selectedFilePath);
            }
          }
          if (minimapCanvasRef.current !== null && graph.order > 20) {
            drawMinimap(graph, sigma!, minimapCanvasRef.current, container);
          }
        } catch (err) {
          console.error("Dextree cluster/minimap draw failed", err);
        }
      });

      observer = new MutationObserver(() => {
        if (sigma !== null) {
          applyTheme(graph, sigma, container);
          updateOverlay();
        }
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });

      setError(null);
    } catch (err) {
      console.error("Dextree graph renderer failed", err);
      sigmaRef.current = null;
      if (canceledRef.current) return;
      setError(err instanceof Error ? err.message : "Could not initialize graph renderer.");
      setFallbackGraph(buildFallbackGraph());
    }

    return () => {
      canceledRef.current = true;
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      observer?.disconnect();
      resizeObserver?.disconnect();
      hoverRef.current = null;
      selectionRef.current = null;
      sigmaRef.current?.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [edges, nodes, onNavigate, reducedMotion, retryCount]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;

    selectionRef.current = computeSelection(
      graph ?? new MultiDirectedGraph(),
      selectedNodeId,
      FLOW_MAX_DEPTH,
    );

    if (graph === null || sigma === null) {
      setOverlaySegments([]);
      return;
    }

    refreshSigma(sigma);
    setOverlaySegments(createOverlaySegments(graph, sigma, selectionRef.current));
  }, [selectedNodeId]);

  // Mirror hidden-edge-kinds into the store so the edgeReducer (created once in
  // the Sigma effect) reads the current filter via getState() without being
  // recreated. Then refresh Sigma to re-run reducers.
  useEffect(() => {
    graphViewStoreRef.current.getState().setHiddenEdgeKinds(hiddenEdgeKinds);
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [hiddenEdgeKinds]);

  // Mirror hidden-node-kinds into the store so the nodeReducer reads the current
  // filter via getState() without being recreated.
  useEffect(() => {
    graphViewStoreRef.current.getState().setHiddenNodeKinds(hiddenNodeKinds);
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [hiddenNodeKinds]);

  // Slice 031 US3 — keep the decorator-backed id set in sync with `nodes`
  // so the Sigma reducer can honor the Decorator filter chip toggle.
  useEffect(() => {
    const next = new Set<string>();
    for (const node of nodes) {
      if (node.flags?.includes("decorator-backed")) {
        next.add(node.id);
      }
    }
    decoratorBackedNodeIdsRef.current = next;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [nodes]);

  // Sync lens-match-set ref so the nodeReducer reads the active lens's matches
  // without being recreated. Refresh Sigma to re-run reducers.
  useEffect(() => {
    lensMatchSetRef.current = lensMatchSet;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [lensMatchSet]);

  // Sync the recolour-lens colour fn ref so the nodeReducer can recolour by
  // layer without being recreated. Null when no recolour lens is active.
  useEffect(() => {
    lensColorOfRef.current = lensColorOf;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [lensColorOf]);

  // Slice 022 — sync matched-node ids + depth visibility set into refs so the
  // nodeReducer reads them without being recreated. The depth-visible set is
  // the union of (selected-node depth neighbourhood) ∪ (each matched-node
  // depth neighbourhood). null means depth filter is inactive — show all.
  const depthVisibleNodeIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    matchedNodeIdsRef.current = matchedNodeIds;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [matchedNodeIds]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!depthEnabled || graph === null) {
      depthVisibleNodeIdsRef.current = null;
    } else {
      const visible = new Set<string>();
      const anchors = matchedNodeIds.size > 0 ? Array.from(matchedNodeIds) : [selectedNodeId!];
      for (const anchor of anchors) {
        const traversal = computeSelection(graph, anchor, depth);
        if (traversal !== null) {
          for (const id of traversal.nodeIds) {
            visible.add(id);
          }
        }
      }
      depthVisibleNodeIdsRef.current = visible;
    }
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [depthEnabled, matchedNodeIds, selectedNodeId, depth]);

  // Slice 023 — sync trace path ids into refs so the nodeReducer + edgeReducer
  // can apply the path-active dimming/highlight without being recreated.
  useEffect(() => {
    tracePhaseRef.current = traceState.phase;
    pathNodeIdsRef.current = new Set(traceState.pathNodeIds);
    pathEdgeIdsRef.current = new Set(traceState.pathEdgeIds);
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [traceState]);

  // Slice 023 — Escape exits trace mode from any phase. Listener attached at
  // window level so it works regardless of focus (matches spec edge case
  // "Escape always exits trace mode regardless of state").
  useEffect(() => {
    if (traceState.phase === "idle") {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleTraceExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [traceState.phase, handleTraceExit]);

  if (fallbackGraph !== null) {
    return <StaticGraphFallback fallbackGraph={fallbackGraph} onNavigate={onNavigate} />;
  }

  if (error !== null) {
    const handleRetry = (): void => {
      setError(null);
      setFallbackGraph(null);
      setRetryCount((prev) => prev + 1);
    };
    const handleShowFallback = (): void => {
      if (graphRef.current !== null) {
        setFallbackGraph(snapshotGraph(graphRef.current));
      }
    };

    return (
      <div className="dxt-error" role="alert">
        <span className="codicon codicon-error" aria-hidden="true" />
        <p>Could not initialize graph renderer.</p>
        <div className="dxt-error-actions">
          <button type="button" onClick={handleRetry} aria-label="Retry graph initialization">
            <span className="codicon codicon-refresh" aria-hidden="true" />
            Retry
          </button>
          {graphRef.current !== null && (
            <button
              type="button"
              onClick={handleShowFallback}
              aria-label="Show fallback static graph view"
            >
              <span className="codicon codicon-graph" aria-hidden="true" />
              Show fallback view
            </button>
          )}
        </div>
      </div>
    );
  }

  const travelerSegments = overlaySegments
    .filter((segment) => segment.kind === "IMPORTS")
    .slice(0, 3);
  const fallbackTravelers =
    travelerSegments.length > 0 ? travelerSegments : overlaySegments.slice(0, 3);

  // B3: Compute callers and callees from graph during render
  type CanvasNeighbor = {
    id: string;
    label: string;
    filePath: string;
    startLine: number;
    symbolKind: string;
  };
  const neighborCallers: CanvasNeighbor[] = [];
  const neighborCallees: CanvasNeighbor[] = [];

  if (selectedNodeId !== null && graphRef.current !== null) {
    const g = graphRef.current;
    if (g.hasNode(selectedNodeId)) {
      g.forEachInboundEdge(selectedNodeId, (_edge, attrs, source) => {
        if ((attrs as GraphEdgeAttributes).edgeKind !== "CALLS") return;
        const a = g.getNodeAttributes(source) as GraphNodeAttributes;
        neighborCallers.push({
          id: source,
          label: a.label,
          filePath: a.filePath,
          startLine: a.startLine,
          symbolKind: a.symbolKind ?? "misc",
        });
      });
      g.forEachOutboundEdge(selectedNodeId, (_edge, attrs, _src, target) => {
        if ((attrs as GraphEdgeAttributes).edgeKind !== "CALLS") return;
        const a = g.getNodeAttributes(target) as GraphNodeAttributes;
        neighborCallees.push({
          id: target,
          label: a.label,
          filePath: a.filePath,
          startLine: a.startLine,
          symbolKind: a.symbolKind ?? "misc",
        });
      });
    }
  }

  const MAX_NEIGHBORS = 8;
  const shownCallers = neighborCallers.slice(0, MAX_NEIGHBORS);
  const shownCallees = neighborCallees.slice(0, MAX_NEIGHBORS);

  // Inspector neighbor lists (slice 033). The Inspector now owns neighbor
  // rendering in the right rail; the canvas neighbor panel becomes redundant.
  // Implements is not tracked separately yet (CALLS-only graph), so it is empty.
  const toInspectorNeighbors = (items: CanvasNeighbor[]): InspectorNeighbor[] =>
    items.map((n) => ({
      id: n.id,
      label: n.label,
      filePath: n.filePath,
      symbolKind: n.symbolKind,
    }));
  const inspectorNeighbors: InspectorNeighbors = {
    calledBy: toInspectorNeighbors(shownCallers),
    calls: toInspectorNeighbors(shownCallees),
    implements: [],
  };

  // Left-rail node-type filter entries: canonical order, counts from the
  // current node set, Decorator stays a disabled future stub (slice 031).
  const nodeKindCounts = new Map<string, number>();
  for (const node of nodes) {
    const key = node.type === "file" ? "file" : (node.symbolKind ?? "misc");
    nodeKindCounts.set(key, (nodeKindCounts.get(key) ?? 0) + 1);
  }
  const fileCount = nodeKindCounts.get("file") ?? 0;
  const symbolCount = nodes.length - fileCount;
  const nodeFilterEntries: NodeFilterEntry[] = CANONICAL_NODE_FILTER_LIST.map((entry) => ({
    ...entry,
    count: nodeKindCounts.get(entry.key) ?? 0,
    ...(entry.key === "decorator"
      ? {
          disabled: true,
          tooltip: "Available after slice 026 — decorator-relationship classification.",
        }
      : {}),
  }));

  // Right-rail edge-type filter entries: counts from the current edge set,
  // ordered to match the mockup. INHERITS surfaces as "Extends".
  const edgeKindCounts = new Map<string, number>();
  for (const edge of edges) {
    edgeKindCounts.set(edge.kind, (edgeKindCounts.get(edge.kind) ?? 0) + 1);
  }
  const EDGE_FILTER_ORDER: ReadonlyArray<{ kind: string; label: string }> = [
    { kind: "DEFINES", label: "Defines" },
    { kind: "IMPORTS", label: "Imports" },
    { kind: "CALLS", label: "Calls" },
    { kind: "INHERITS", label: "Extends" },
    { kind: "INSTANTIATES", label: "New" },
    { kind: "IMPLEMENTS", label: "Implements" },
  ];
  const edgeTypeEntries: EdgeTypeEntry[] = EDGE_FILTER_ORDER.filter(
    (e) => (edgeKindCounts.get(e.kind) ?? 0) > 0 || e.kind === "IMPLEMENTS",
  ).map((e) => ({
    kind: e.kind,
    label: e.label,
    count: edgeKindCounts.get(e.kind) ?? 0,
    ...(e.kind === "IMPLEMENTS"
      ? { disabled: true, tooltip: "Implements edges are always shown." }
      : {}),
  }));

  const activeLayoutLabel =
    LAYOUT_PRESET_OPTIONS.find((o) => o.id === layoutSelection.activePreset)?.label ??
    layoutSelection.activePreset;

  return (
    <div className={shellStyles.shell} data-testid="graph-view-shell">
      {/* TOOLBAR area */}
      <div className={shellStyles.toolbarArea}>
        <GraphToolbar
          onExportMermaid={onExportMermaid}
          showMinimap={showMinimap}
          onToggleMinimap={onToggleMinimap}
          showClusterHulls={showClusterHulls}
          onToggleClusterHulls={onToggleClusterHulls}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searchFocusedIndex={searchFocusedIndex}
          onSearchQueryChange={handleSearchQueryChange}
          onSearchSelectResult={handleSearchSelectResult}
          onSearchClear={handleSearchClear}
          depth={depth}
          depthEnabled={depthEnabled}
          onDepthChange={handleDepthChange}
          tracePhase={traceState.phase}
          onTraceToggle={handleTraceToggle}
          onTraceExit={handleTraceExit}
          canExportTrace={
            traceState.phase === "path-active" &&
            traceState.startNodeId !== null &&
            traceState.endNodeId !== null &&
            traceState.pathNodeIds.length > 0
          }
          {...(onExportTraceSequence !== undefined && {
            onExportTrace: () => {
              if (
                traceState.phase !== "path-active" ||
                traceState.startNodeId === null ||
                traceState.endNodeId === null ||
                traceState.pathNodeIds.length === 0
              ) {
                return;
              }
              onExportTraceSequence({
                phase: "path-active",
                startNodeId: traceState.startNodeId,
                endNodeId: traceState.endNodeId,
                nodeIds: [...traceState.pathNodeIds],
                edgeIds: [...traceState.pathEdgeIds],
              });
            },
          })}
          {...(workspaceName !== undefined && { workspaceName })}
          {...(workspaceFrameworks !== undefined && { workspaceFrameworks })}
          {...(onWorkspaceSwitcherClick !== undefined && { onWorkspaceSwitcherClick })}
          activeLayoutPreset={layoutSelection.activePreset}
          onSelectLayoutPreset={handleSelectLayoutPreset}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomFit={handleZoomFit}
          onZoomReset={handleZoomReset}
          {...(onReindex !== undefined && { onReindex })}
          {...(onClearWorkspace !== undefined && { onClearWorkspace })}
          {...(onClearAll !== undefined && { onClearAll })}
          {...(onToggleSourceOnly !== undefined && { onToggleSourceOnly })}
          {...(sourceOnly !== undefined && { sourceOnly })}
          {...(isIndexing !== undefined && { isIndexing })}
        />
      </div>

      {/* LEFT rail: trace path (in trace mode) or Lenses + Node Types */}
      {traceState.phase === "path-active" ? (
        <aside className={shellStyles.left} aria-label="Trace path" data-testid="trace-left-rail">
          <section className={shellStyles.traceSection}>
            <header className={shellStyles.traceHeader}>Trace</header>
            <p className={shellStyles.traceHint}>From start through the call chain</p>
            {(() => {
              const stepNode = (id: string) => nodes.find((n) => n.id === id) ?? null;
              const rows: Array<{ group: string; ids: string[] }> = [
                { group: "Start", ids: traceState.startNodeId ? [traceState.startNodeId] : [] },
                { group: "End", ids: traceState.endNodeId ? [traceState.endNodeId] : [] },
                {
                  group: `Path (${traceState.pathEdgeIds.length} hops)`,
                  ids: traceState.pathNodeIds,
                },
              ];
              return rows.map((row) => (
                <div key={row.group}>
                  <div className={shellStyles.traceGroupTitle}>{row.group}</div>
                  {row.ids.map((id) => {
                    const node = stepNode(id);
                    return (
                      <button
                        key={`${row.group}-${id}`}
                        type="button"
                        className={shellStyles.traceRow}
                        data-testid={`trace-left-step-${id}`}
                        onClick={() => handleTraceStepClick(id)}
                        title={node ? `${node.filePath}:${node.startLine}` : id}
                      >
                        <span
                          className={`codicon codicon-symbol-${node?.symbolKind ?? "misc"}`}
                          aria-hidden="true"
                        />
                        <span className={shellStyles.traceRowLabel}>{node?.label ?? id}</span>
                        {node && (
                          <span className={shellStyles.traceRowPath}>
                            {node.filePath.split(/[/\\]/).pop()}:{node.startLine}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </section>
        </aside>
      ) : (
        <aside className={shellStyles.left} aria-label="Graph lenses and filters">
          <LensesPanel
            activeLensId={activeLensId}
            lensCounts={lensCounts}
            onLensToggle={onLensToggle}
          />
          {activeLensId !== null && lensResultRows !== null && (
            <LensResultTable
              lensTitle={LENS_REGISTRY[activeLensId].title}
              rows={lensResultRows}
              selectedNodeId={selectedNodeId}
              onSelectRow={selectAndFlyToNode}
            />
          )}
          <NodeFilterPanel
            entries={nodeFilterEntries}
            hiddenKinds={hiddenNodeKinds}
            onToggle={handleToggleNodeKind}
          />
          <EdgeTypesPanel
            entries={edgeTypeEntries}
            hiddenKinds={hiddenEdgeKinds}
            onToggle={handleToggleEdgeKind}
          />
        </aside>
      )}

      {/* CANVAS area */}
      <main className={`${shellStyles.canvas} dxt-graph-stage`}>
        <canvas className="dxt-cluster-layer" ref={clusterCanvasRef} />
        <div id="dxt-graph-container" data-testid="graph-view" ref={containerRef} />
        <svg
          className="dxt-selection-overlay"
          data-testid="selection-overlay"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          {overlaySegments.map((segment) => (
            <motion.line
              key={segment.id}
              className={`dxt-selection-path${segment.kind === "IMPORTS" ? " dxt-selection-path--imports" : ""}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              initial={false}
              {...(reducedMotion
                ? {}
                : {
                    animate: { strokeDashoffset: [-16, -2] },
                    transition: {
                      duration: 1.4,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear" as const,
                      delay: segment.hopIndex * 0.18,
                    },
                  })}
            />
          ))}

          {!reducedMotion
            ? fallbackTravelers.map((segment, index) => (
                <motion.circle
                  key={`${segment.id}-traveler-${index}`}
                  className="dxt-selection-traveler"
                  r={3.5}
                  fill={segment.color}
                  initial={false}
                  animate={{
                    cx: [segment.x1, segment.x2],
                    cy: [segment.y1, segment.y2],
                  }}
                  transition={{
                    duration: 1.25 + index * 0.12,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                    delay: segment.hopIndex * 0.22,
                  }}
                />
              ))
            : null}
        </svg>

        {/* Canvas overlays (slice 033 US4) */}
        <div className="dxt-floating dxt-zoom-controls" data-testid="canvas-zoom-controls">
          <button
            type="button"
            className="dxt-icon-btn"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={handleZoomIn}
          >
            <span className="codicon codicon-zoom-in" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dxt-icon-btn"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={handleZoomOut}
          >
            <span className="codicon codicon-zoom-out" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dxt-icon-btn"
            title="Fit to screen"
            aria-label="Fit"
            onClick={handleZoomFit}
          >
            <span className="codicon codicon-screen-full" aria-hidden="true" />
          </button>
        </div>

        <div className="dxt-legend" data-testid="canvas-legend">
          <div className="dxt-legend-title">Layers</div>
          <div className="dxt-legend-row">
            <span className="dxt-legend-chip" style={{ background: "var(--layer-entry)" }} />
            Entry
          </div>
          <div className="dxt-legend-row">
            <span className="dxt-legend-chip" style={{ background: "var(--layer-domain)" }} />
            Domain
          </div>
          <div className="dxt-legend-row">
            <span className="dxt-legend-chip" style={{ background: "var(--layer-io)" }} />
            I/O
          </div>
          <hr className="dxt-legend-sep" />
          <div className="dxt-legend-row">
            <span
              className="dxt-legend-swatch"
              style={{ background: "var(--vscode-charts-blue)" }}
            />
            Defines
          </div>
          <div className="dxt-legend-row">
            <span
              className="dxt-legend-swatch"
              style={{ background: "var(--vscode-charts-green)" }}
            />
            Imports
          </div>
          <div className="dxt-legend-row">
            <span
              className="dxt-legend-swatch"
              style={{ background: "var(--vscode-charts-orange)" }}
            />
            Calls
          </div>
        </div>

        <div className="dxt-canvas-help" data-testid="canvas-help">
          <span>
            <kbd>Click</kbd> isolate
          </span>
          <span>
            <kbd>Dbl-click</kbd> editor
          </span>
          <span>
            <kbd>Scroll</kbd> zoom
          </span>
          <span>
            <kbd>Esc</kbd> clear
          </span>
        </div>

        {layoutSelection.notice !== null && (
          <div
            className="dxt-layout-notice"
            role="status"
            aria-live="polite"
            data-preset={layoutSelection.notice.preset}
          >
            <span className="codicon codicon-info" aria-hidden="true" />
            <span className="dxt-layout-notice__text">{layoutSelection.notice.message}</span>
          </div>
        )}
        <canvas
          className={`dxt-minimap-canvas${showMinimap ? "" : " dxt-minimap-canvas--hidden"}`}
          ref={minimapCanvasRef}
          width={128}
          height={96}
        />
        {activeLensId !== null && (
          <footer
            className={lensesPanelStyles.lensStatusBar}
            data-testid="lens-status-bar"
            role="contentinfo"
          >
            <span className={lensesPanelStyles.lensPill}>
              <span
                className={`codicon codicon-${LENS_REGISTRY[activeLensId].iconKey}`}
                aria-hidden="true"
              />
              {`Lens: ${LENS_REGISTRY[activeLensId].title}`}
            </span>
            {activeLensId === "architecture" && (
              <span className={lensesPanelStyles.lensLegend} data-testid="lens-layer-legend">
                {CLASSIFIED_LAYERS.map((layer) => (
                  <span key={layer} className={lensesPanelStyles.lensLegendItem}>
                    <span
                      className={lensesPanelStyles.lensLegendSwatch}
                      style={{ background: layerColor(layer) ?? "transparent" }}
                      aria-hidden="true"
                    />
                    {layer}
                  </span>
                ))}
              </span>
            )}
          </footer>
        )}
        {traceState.phase !== "idle" && (
          <TraceBanner
            state={traceState}
            startLabel={
              traceState.startNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.startNodeId)?.label ?? null)
            }
            endLabel={
              traceState.endNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.endNodeId)?.label ?? null)
            }
            onExit={handleTraceExit}
          />
        )}
      </main>

      {/* RIGHT rail: Edge Types + Inspector (or Trace details in trace mode) */}
      <aside className={shellStyles.right} aria-label="Edge filters and inspector">
        {traceState.phase === "path-active" ? (
          <TraceInspector
            tracePath={
              graphRef.current === null ? null : computeTracePath(graphRef.current, traceState)
            }
            noPathFound={traceState.noPathFound}
            startLabel={
              traceState.startNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.startNodeId)?.label ?? null)
            }
            endLabel={
              traceState.endNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.endNodeId)?.label ?? null)
            }
            onStepClick={handleTraceStepClick}
          />
        ) : (
          <InspectorPanel
            selectedNode={
              selectedNodeId === null ? null : (nodes.find((n) => n.id === selectedNodeId) ?? null)
            }
            onTraceFromHere={traceState.phase === "idle" ? handleTraceFromHere : undefined}
            neighbors={inspectorNeighbors}
            onNeighborClick={(id) => {
              const target = nodes.find((n) => n.id === id);
              if (target !== undefined) {
                onNavigate(target.filePath, target.startLine);
              }
            }}
          />
        )}
      </aside>

      {/* STATUS bar */}
      <footer className={shellStyles.status} data-testid="graph-status-bar">
        <span className={shellStyles.statusItem}>
          <span className={shellStyles.statusPill}>{fileCount} files</span>
        </span>
        <span className={shellStyles.statusItem}>
          <span className={shellStyles.statusPill}>{symbolCount} symbols</span>
        </span>
        <span className={shellStyles.statusItem}>
          <span className={shellStyles.statusPill}>{edges.length} edges</span>
        </span>
        {workspaceFrameworks !== undefined && workspaceFrameworks.length > 0 && (
          <span className={shellStyles.statusItem}>
            {workspaceFrameworks.map((fw) => (
              <span
                key={fw}
                className={`${shellStyles.statusPill} ${shellStyles.statusPillFramework}`}
                data-framework={fw}
              >
                {fw}
              </span>
            ))}
          </span>
        )}
        {activeLensId !== null && (
          <span className={shellStyles.statusItem}>
            <span className={`${shellStyles.statusPill} ${shellStyles.statusPillLens}`}>
              <span
                className={`codicon codicon-${LENS_REGISTRY[activeLensId].iconKey}`}
                aria-hidden="true"
              />
              {LENS_REGISTRY[activeLensId].title}
            </span>
          </span>
        )}
        <span className={shellStyles.statusSpacer} />
        <span className={shellStyles.statusItem}>
          <span className="codicon codicon-list-tree" aria-hidden="true" />
          Depth {depth}
        </span>
        <span className={shellStyles.statusItem}>
          <span className="codicon codicon-graph" aria-hidden="true" />
          {activeLayoutLabel}
        </span>
      </footer>
    </div>
  );
}
