import type { GraphEdge } from "@dextree/core";
import { CLASSIFIED_LAYERS } from "@dextree/core/lenses";
import { MultiDirectedGraph } from "graphology";
import { edgePathFromNodePath } from "graphology-shortest-path";
import { bidirectional } from "graphology-shortest-path/unweighted";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Sigma from "sigma";

import {
  applyLayoutPreset,
  assignRadialPositions,
  LAYOUT_PRESET_OPTIONS,
  restoreNodePositions,
  snapshotNodePositions,
} from "./graphLayoutPresets.js";
import { LazyFocusedGraphView } from "../blast-radius/LazyFocusedGraphView.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { EdgeTypesPanel, type EdgeTypeEntry } from "./EdgeTypesPanel.js";
import { fitCameraToNodes, type NodeBoundsGraph } from "./cameraFit.js";
import {
  InspectorPanel,
  type InspectorNeighbor,
  type InspectorNeighbors,
} from "./InspectorPanel.js";
import { LENS_REGISTRY, LensesPanel } from "./LensesPanel.js";
import { LensResultTable } from "./LensResultTable.js";
import { useGraphLenses } from "./hooks/useGraphLenses.js";
import lensesPanelStyles from "./LensesPanel.module.css";
import {
  CANONICAL_NODE_FILTER_LIST,
  NodeFilterPanel,
  type NodeFilterEntry,
} from "./NodeFilterPanel.js";
import shellStyles from "./GraphView.module.css";
import { TraceBanner } from "./TraceBanner.js";
import { TraceInspector } from "./TraceInspector.js";
import { layerColor } from "./lensColor.js";
import { drawClusterHulls, drawMinimap } from "./graphOverlay.js";
import { computeSelection, computeTracePath } from "./graphTraversal.js";
import { StaticGraphFallback } from "./StaticGraphFallback.js";
import { SigmaController } from "./SigmaController.js";
import {
  buildGraph,
  edgeColor,
  mixWithBackground,
  snapshotGraph,
  symbolColor,
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
  type TraceState,
} from "./graphViewTypes.js";

const CAMERA_CENTER_DURATION_MS = 380;
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

// Fallback entry-border colour for `readThemeColors` when the
// `--vscode-charts-yellow` token is absent; muted gold survives all themes.
const ENTRY_BORDER_COLOR_FALLBACK = "#d4af37";

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
    animatedReset?: (options?: { duration?: number }) => unknown;
  };
  refresh?: () => void;
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
    // Trace path edge color. Reuses the chart yellow if defined;
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
function applyTheme(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  container: HTMLDivElement,
): ThemeColors {
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
  return colors;
}

export function GraphView({
  nodes,
  edges,
  onNavigate,
  onExportMermaid,
  initialShowClusterHulls,
  onPersistClusterHulls,
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
  const clusterCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  // Owns the imperative Sigma layer. Constructed once and adopted into the mount
  // effect; the strangler migration moves operations onto it phase by phase so
  // the ~460-line effect can collapse to construct/adopt/dispose.
  const controllerRef = useRef<SigmaController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SigmaController(graphViewStoreRef.current, {
      readThemeColors,
      // React owns the SVG traveler overlay; the controller hands back the
      // active selection and we build the segments from the live sigma/graph.
      onOverlayUpdate: (selection) => {
        const sigma = sigmaRef.current;
        const graph = graphRef.current;
        if (sigma === null || graph === null) {
          setOverlaySegments([]);
          return;
        }
        setOverlaySegments(createOverlaySegments(graph, sigma, selection));
      },
    });
  }

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [fallbackGraph, setFallbackGraph] = useState<FallbackGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Pre-radial node positions, captured when a selection begins so deselect can
  // restore the exact prior layout. Null when no selection is repositioning.
  const radialSnapshotRef = useRef<ReturnType<typeof snapshotNodePositions> | null>(null);
  const [overlaySegments, setOverlaySegments] = useState<OverlaySegment[]>([]);
  const [showMinimap, setShowMinimap] = useState(false);
  // Seed from the restored preference (VS Code state); default on when unset.
  const [showClusterHulls, setShowClusterHulls] = useState(initialShowClusterHulls ?? true);
  const showClusterHullsRef = useRef(initialShowClusterHulls ?? true);
  const [hiddenEdgeKinds, setHiddenEdgeKinds] = useState<Set<GraphEdge["kind"]>>(
    () => new Set(DEFAULT_HIDDEN_EDGE_KINDS),
  );
  // Layout preset selection. ForceAtlas2 is the session default for every
  // fresh GraphView open; preset state is local to this component and never
  // persisted or sent to the extension host.
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

      // Whole-graph visibility. Filter-aware visibility can
      // be plumbed in later if a filter-active preset run produces awkward
      // results; until then noverlap operates on every node, but only the
      // currently rendered ones impact the user-visible arrangement.
      const visibleNodeIds = new Set<string>(graph.nodes());
      const visibleEdgeIds = new Set<string>(graph.edges());

      // Snapshot the prior coordinates before any Hierarchical attempt so
      // we can restore them if the DAG suitability check rejects.
      // Other presets don't need this — they either apply or no-op without
      // ever touching coordinates.
      const snapshot = preset === "hierarchical" ? snapshotNodePositions(graph) : null;

      const result = applyLayoutPreset(graph, preset, {
        activePreset: layoutSelection.activePreset,
        visibleNodeIds,
        visibleEdgeIds,
      });

      // TEMP diagnostic (remove after Circular is confirmed): shows which branch
      // the layout-apply took. View in Webview Developer Tools console.
      console.log(
        `[layout] preset=${preset} active=${layoutSelection.activePreset} ` +
          `nodes=${visibleNodeIds.size} → status=${result.status}` +
          (result.status === "noop" ? ` reason=${result.reason}` : "") +
          (result.status === "rejected" ? ` reason=${result.reason}` : ""),
      );

      if (result.status === "applied") {
        setLayoutSelection({ activePreset: result.preset, notice: null });
        const sigma = sigmaRef.current;
        sigma?.refresh();
        // Re-running ForceAtlas2 → let it settle live again. Circular/Hierarchical
        // are fixed structural layouts, so they don't get the live sim.
        if (result.preset === "forceAtlas2") {
          controllerRef.current?.restartLiveLayout();
        }
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
  // stays non-blocking. New notices replace older ones immediately
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
  // Search state. `searchQuery` is the committed (post-debounce)
  // value; the SearchBar manages its own pending input internally.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchFocusedIndex, setSearchFocusedIndex] = useState<number>(0);
  // Depth slider state. Default 3.
  const [depth, setDepth] = useState<number>(3);
  // Node focus: the focused node id, or null when not focused. React tracks it
  // for the exit affordance; the controller owns the focus membership.
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  // Trace state. React owns the trace state machine for the banner /
  // rails / inspector; the controller holds the phase + path id sets the Sigma
  // reducers read, kept in sync via setTracePhase (eager) + setTracePath.
  const [traceState, setTraceState] = useState<TraceState>(TRACE_STATE_IDLE);

  const onToggleMinimap = useCallback(() => {
    setShowMinimap((visible) => !visible);
  }, []);

  const onToggleClusterHulls = useCallback(() => {
    setShowClusterHulls((visible) => {
      showClusterHullsRef.current = !visible;
      // Persist the new preference through the webview state so it survives a
      // reload (VS Code getState/setState — never localStorage).
      onPersistClusterHulls?.(!visible);
      return !visible;
    });
    const cc = clusterCanvasRef.current;
    if (cc !== null) {
      const ctx = cc.getContext("2d");
      if (!showClusterHullsRef.current) ctx?.clearRect(0, 0, cc.width, cc.height);
      else sigmaRef.current?.refresh();
    }
  }, [onPersistClusterHulls]);

  // Lens state + all lens-derived values (counts, active-match set, recolour fn,
  // result rows) — see useGraphLenses.
  const { activeLensId, lensCounts, lensMatchSet, lensColorOf, onLensToggle, lensResultRows } =
    useGraphLenses(nodes, graphRef);

  // Search results. Case-insensitive substring match on label + filePath.
  // `fqn` is not yet present on GraphNode; falls back gracefully
  // (always-undefined).
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

  // Reposition the selected node's neighbourhood as concentric rings (center +
  // 2 hops) so its edges fan out radially with minimal crossing. Snapshots the
  // prior layout once per selection so deselect can restore it exactly.
  const applyRadialOnSelect = useCallback((selection: { nodeLayers: string[][] } | null): void => {
    const graph = graphRef.current;
    if (graph === null || selection === null || selection.nodeLayers.length === 0) return;
    if (radialSnapshotRef.current === null) {
      radialSnapshotRef.current = snapshotNodePositions(graph);
    }
    assignRadialPositions(graph, selection.nodeLayers);
    sigmaRef.current?.refresh();
  }, []);

  // Restore the pre-radial layout (deselect / data change). No-op if nothing was
  // repositioned.
  const restoreFromRadial = useCallback((): void => {
    const graph = graphRef.current;
    const snapshot = radialSnapshotRef.current;
    if (graph === null || snapshot === null) return;
    restoreNodePositions(graph, snapshot);
    radialSnapshotRef.current = null;
    sigmaRef.current?.refresh();
  }, []);

  // The focused (React Flow boxed-card) view's input traversal, or null when the
  // overlay is closed. Opened by Alt/Cmd + double-click; the Sigma canvas stays
  // mounted underneath so closing restores it with no rebuild.
  const [focusedTraversal, setFocusedTraversal] = useState<SelectionTraversal | null>(null);

  const openFocusedView = useCallback(
    (nodeId: string): void => {
      const graph = graphRef.current;
      if (graph === null || !graph.hasNode(nodeId)) return;
      // Honour the current depth control as the focused neighbourhood radius.
      setFocusedTraversal(computeSelection(graph, nodeId, depth));
    },
    [depth],
  );

  const closeFocusedView = useCallback((): void => {
    setFocusedTraversal(null);
  }, []);

  // The mount effect must not re-run when `depth` changes (it would rebuild
  // Sigma). Route onFocus through a ref that always holds the latest
  // depth-aware opener, so the mount callback stays stable.
  const openFocusedViewRef = useRef(openFocusedView);
  openFocusedViewRef.current = openFocusedView;

  // Select a node (highlight + neighbourhood + Inspector) the same way a canvas
  // single-click does, then fly the camera to it with a zoom so the move is
  // obvious. `selectNode` lives in the Sigma effect closure, so the state writes
  // are replicated here. Shared by search-result and lens-row selection.
  const selectAndFlyToNode = useCallback(
    (nodeId: string): void => {
      const sigma = sigmaRef.current;
      const graph = graphRef.current;
      if (graph === null || !graph.hasNode(nodeId)) return;
      setSelectedNodeId(nodeId);
      // Historically this path set the selection + refreshed but did not touch the
      // overlay (unlike a canvas click); preserve that by opting out.
      controllerRef.current?.setSelection(nodeId, { updateOverlay: false });
      // Radial repositions the selected node to the origin, so fly there.
      applyRadialOnSelect(controllerRef.current?.currentSelection ?? null);

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
    },
    [applyRadialOnSelect],
  );

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

  // Trace mode handlers.
  const handleTraceToggle = useCallback((): void => {
    setTraceState((current) => {
      if (current.phase !== "idle") {
        controllerRef.current?.setTracePhase("idle");
        return TRACE_STATE_IDLE;
      }
      // Entering trace mode clears search + depth so the full graph is
      // visible for node picking.
      setSearchQuery("");
      setSearchFocusedIndex(0);
      setDepth(3);
      controllerRef.current?.setTracePhase("picking-start");
      return { ...TRACE_STATE_IDLE, phase: "picking-start" };
    });
  }, []);

  const handleTraceExit = useCallback((): void => {
    controllerRef.current?.setTracePhase("idle");
    setTraceState(TRACE_STATE_IDLE);
  }, []);

  // Zoom handlers. Delegate to the controller, which owns the
  // Sigma instance + camera math.
  const handleZoomIn = useCallback((): void => {
    controllerRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback((): void => {
    controllerRef.current?.zoomOut();
  }, []);

  const handleZoomFit = useCallback((): void => {
    controllerRef.current?.zoomFit();
  }, []);

  const handleZoomReset = useCallback((): void => {
    controllerRef.current?.zoomReset();
  }, []);

  // Export exactly the rendered view: derive the current VisibleView membership
  // from the controller (same hide logic as the reducers) and hand the id arrays
  // up so the host exports the `visible` scope. No-op before the controller is
  // mounted (nothing rendered yet to export).
  // Single Export entry point: hand the host the current VisibleView membership
  // so it can offer "current view (N nodes)" vs "whole workspace" and export the
  // chosen scope. The host shows the picker; the webview only supplies the ids.
  const handleExportMermaid = useCallback((): void => {
    const view = controllerRef.current?.getVisibleView();
    onExportMermaid([...(view?.nodeIds ?? [])], [...(view?.edgeIds ?? [])]);
  }, [onExportMermaid]);

  // Filter toggles. The hidden-kind sets already drive the
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

    // Trace the real call path on the full graph. Filters affect what the canvas
    // *renders*, but the trace must find the actual route between the two nodes —
    // bounding it to the visible set made any path through a filtered-out kind
    // (file/property/variable/…, hidden by default) collapse to "no path".
    const nodePath = bidirectional(graph, startId, endId);

    if (nodePath === null) {
      controllerRef.current?.setTracePhase("path-active");
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
    controllerRef.current?.setTracePhase("path-active");
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
          controllerRef.current?.setTracePhase("picking-end");
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
   * "Trace from here" entry point. Pre-fills the trace start
   * with the given node id and transitions directly to picking-end. Clears
   * search + depth like the toolbar toggle does.
   */
  const handleTraceFromHere = useCallback((nodeId: string): void => {
    setSearchQuery("");
    setSearchFocusedIndex(0);
    setDepth(3);
    controllerRef.current?.setTracePhase("picking-end");
    setTraceState({
      ...TRACE_STATE_IDLE,
      phase: "picking-end",
      startNodeId: nodeId,
    });
  }, []);

  // Node focus (new capability): collapse the view to a node's neighbourhood at
  // the current depth. Focus is additive — it narrows membership without
  // touching lens/filters/depth — so exiting simply clears it and the prior view
  // is intact. React tracks the focused id for the exit affordance; the
  // controller owns the focus membership the reducer + export read.
  const handleFocusNode = useCallback(
    (nodeId: string): void => {
      controllerRef.current?.setFocus(nodeId, depth);
      setFocusNodeId(nodeId);
      // Re-frame the camera onto the focused neighbourhood for readability.
      controllerRef.current?.zoomFit();
    },
    [depth],
  );

  const handleExitFocus = useCallback((): void => {
    controllerRef.current?.setFocus(null, depth);
    setFocusNodeId(null);
    controllerRef.current?.zoomFit();
  }, [depth]);

  /** Animate the Sigma camera to the given node (trace-step click). */
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
    // Graph data changed — drop any pending radial snapshot rather than restoring
    // it: its node ids belong to the previous graph and the new layout is fresh.
    radialSnapshotRef.current = null;
    // Clear the controller's selection/hover render mirror when the graph data
    // changes. setSelection(null) also clears the overlay; setHover(null) is a
    // no-op before mount (no graph yet) and clears hover after.
    controllerRef.current?.setSelection(null);
    controllerRef.current?.setHover(null);
    // setFocus(null) clears focus; the depth arg is unused when exiting.
    controllerRef.current?.setFocus(null, 0);
    setFocusNodeId(null);
    setOverlaySegments([]);
  }, [edges, nodes]);

  useEffect(() => {
    const container = containerRef.current;
    const controller = controllerRef.current;

    if (container === null || controller === null) {
      return;
    }

    const colors = readThemeColors();
    const graph = buildGraph(nodes, edges, colors);

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

    const updateOverlay = (): void => {
      const sigma = sigmaRef.current;
      if (sigma === null) {
        setOverlaySegments([]);
        return;
      }
      setOverlaySegments(createOverlaySegments(graph, sigma, controller.currentSelection));
    };

    const drawAfterRender = (): void => {
      const sigma = sigmaRef.current;
      if (sigma === null) return;
      try {
        const cc = clusterCanvasRef.current;
        if (cc !== null) {
          if (!showClusterHullsRef.current) {
            cc.getContext("2d")?.clearRect(0, 0, cc.width, cc.height);
          } else {
            const hoveredNodeId = controller.hoveredNode;
            const activeSelection = controller.currentSelection;
            const hoveredFilePath =
              hoveredNodeId !== null && graph.hasNode(hoveredNodeId)
                ? String((graph.getNodeAttributes(hoveredNodeId) as GraphNodeAttributes).filePath)
                : null;
            const selectedFilePath =
              activeSelection !== null && graph.hasNode(activeSelection.selectedNodeId)
                ? String(
                    (graph.getNodeAttributes(activeSelection.selectedNodeId) as GraphNodeAttributes)
                      .filePath,
                  )
                : null;
            drawClusterHulls(
              graph,
              sigma,
              cc,
              hoveredFilePath,
              selectedFilePath,
              controller.communityPartition.byNode,
              controller.getVisibleView().nodeIds,
            );
          }
        }
        if (minimapCanvasRef.current !== null && controller.shouldDrawMinimap()) {
          drawMinimap(graph, sigma, minimapCanvasRef.current, container);
        }
      } catch (err) {
        console.error("Dextree cluster/minimap draw failed", err);
      }
    };

    if (!canUseWebGL()) {
      sigmaRef.current = null;
      setError(null);
      setFallbackGraph(snapshotGraph(graph));
      return () => {
        graphRef.current = null;
      };
    }

    try {
      const sigma = controller.mount(container, graph, {
        onNavigate,
        onFocus: (nodeId) => openFocusedViewRef.current(nodeId),
        onSelect: (nodeId) => {
          // React stays authoritative for the Inspector; the controller owns the
          // selection traversal + overlay. Selecting does NOT recenter the camera.
          setSelectedNodeId(nodeId);
          controller.setSelection(nodeId);
          applyRadialOnSelect(controller.currentSelection);
        },
        onClear: () => {
          setSelectedNodeId(null);
          controller.setSelection(null);
          restoreFromRadial();
        },
        onTracePick: (nodeId) => handleTraceNodeClick(nodeId),
        // mount() sets the controller's instance before invoking this, so read
        // it from the controller rather than the not-yet-assigned `sigma` const.
        applyTheme: () => {
          const instance = controller.instance;
          return instance === null ? readThemeColors() : applyTheme(graph, instance, container);
        },
        updateOverlay,
        onResize: () => {
          const cc = clusterCanvasRef.current;
          if (cc !== null) {
            cc.width = container.clientWidth;
            cc.height = container.clientHeight;
          }
        },
        onAfterRender: drawAfterRender,
      });
      sigmaRef.current = sigma;
      setFallbackGraph(null);
      setOverlaySegments([]);
      setError(null);
    } catch (err) {
      console.error("Dextree graph renderer failed", err);
      controller.dispose();
      sigmaRef.current = null;
      setError(err instanceof Error ? err.message : "Could not initialize graph renderer.");
      setFallbackGraph(snapshotGraph(graph));
    }

    return () => {
      controller.dispose();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [edges, nodes, onNavigate, reducedMotion, retryCount]);

  // Keep the controller's selection render mirror in sync whenever the React
  // selectedNodeId changes (canvas click, search/lens row, clear). The
  // controller recomputes the traversal, refreshes Sigma, and pushes the
  // overlay; this is the single sync point so all selection sources converge.
  useEffect(() => {
    controllerRef.current?.setSelection(selectedNodeId);
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

  // Keep the decorator-backed id set on the controller in sync
  // with `nodes` so the node reducer can honor the Decorator filter chip toggle.
  useEffect(() => {
    const next = new Set<string>();
    for (const node of nodes) {
      if (node.flags?.includes("decorator-backed")) {
        next.add(node.id);
      }
    }
    controllerRef.current?.setDecoratorBackedNodeIds(next);
  }, [nodes]);

  // Sync the active match-lens set onto the controller (non-matches dim).
  useEffect(() => {
    controllerRef.current?.setLensMatchSet(lensMatchSet);
  }, [lensMatchSet]);

  // Sync the recolour-lens colour fn onto the controller (null = no recolour).
  useEffect(() => {
    controllerRef.current?.setLensColorOf(lensColorOf);
  }, [lensColorOf]);

  // Sync matched-node ids onto the controller (non-matches dim).
  useEffect(() => {
    controllerRef.current?.setMatchedNodeIds(matchedNodeIds);
  }, [matchedNodeIds]);

  // Depth-visible set: the union of (selected-node depth neighbourhood) ∪ (each
  // matched-node depth neighbourhood). null means the depth filter is inactive
  // (show all). This set is membership, not just dimming: the node reducer hides
  // out-of-window nodes (Sigma does not draw hidden nodes) and getVisibleView
  // excludes them, so depth scopes both the render and the export/trace. Nodes
  // are kept in the graphology graph (hidden, not removed) to preserve layout
  // coordinates across depth changes; physically pruning the graph for very
  // large reduced sets is a perf optimization left as a follow-up.
  useEffect(() => {
    const graph = graphRef.current;
    if (!depthEnabled || graph === null) {
      controllerRef.current?.setDepthVisibleNodeIds(null);
      return;
    }
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
    controllerRef.current?.setDepthVisibleNodeIds(visible);
  }, [depthEnabled, matchedNodeIds, selectedNodeId, depth]);

  // Keep the focus neighbourhood tracking the current depth: when focused and
  // depth changes, recompute the focus set so the collapsed view expands or
  // contracts with the slider. No-op when not focused.
  useEffect(() => {
    if (focusNodeId !== null) {
      controllerRef.current?.setFocus(focusNodeId, depth);
    }
  }, [focusNodeId, depth]);

  // Sync the trace render mirror onto the controller so the node/edge reducers
  // apply the path-active dimming/highlight. React owns traceState (banner /
  // rails / inspector); the controller holds the phase + path id sets the
  // reducers read, and refreshes Sigma.
  useEffect(() => {
    controllerRef.current?.setTracePath(
      traceState.phase,
      traceState.pathNodeIds,
      traceState.pathEdgeIds,
    );
  }, [traceState]);

  // Escape exits trace mode from any phase. Listener attached at window level
  // so it works regardless of focus — Escape always exits trace mode
  // regardless of state.
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

  // Inspector neighbor lists. The Inspector now owns neighbor
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
  // current node set, Decorator stays a disabled future stub.
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
          tooltip: "Not yet available — decorator-relationship classification.",
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
          onExportMermaid={handleExportMermaid}
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
          {activeLensId !== null && (
            <p className="dxt-lens-refine-hint" role="note" data-testid="lens-refine-hint">
              <span className="codicon codicon-filter" aria-hidden="true" />
              Filters below refine the <strong>{LENS_REGISTRY[activeLensId].title}</strong> subject
            </p>
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

        {/* Canvas overlays */}
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

        {focusNodeId !== null && (
          <div className="dxt-floating dxt-focus-chip" role="status" data-testid="focus-chip">
            <span className="codicon codicon-eye" aria-hidden="true" />
            <span className="dxt-focus-chip__label">
              Focused: {nodes.find((n) => n.id === focusNodeId)?.label ?? focusNodeId}
            </span>
            <button
              type="button"
              className="dxt-icon-btn"
              onClick={handleExitFocus}
              title="Exit focus"
              aria-label="Exit focus"
              data-testid="focus-exit"
            >
              <span className="codicon codicon-close" aria-hidden="true" />
            </button>
          </div>
        )}

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
            onFocusNode={traceState.phase === "idle" ? handleFocusNode : undefined}
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

      {focusedTraversal !== null ? (
        <div className={shellStyles.focusedOverlay} data-testid="focused-view-overlay">
          <button
            type="button"
            className={shellStyles.focusedCloseButton}
            onClick={closeFocusedView}
            aria-label="Close focused view"
          >
            <span className="codicon codicon-close" aria-hidden="true" /> Close
          </button>
          <LazyFocusedGraphView
            graphNodes={nodes}
            graphEdges={edges}
            traversal={focusedTraversal}
            colors={readThemeColors()}
          />
        </div>
      ) : null}
    </div>
  );
}
