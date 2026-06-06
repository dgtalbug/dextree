import { createNodeBorderProgram } from "@sigma/node-border";
import { NodeSquareProgram } from "@sigma/node-square";
import type { Attributes } from "graphology-types";
import type { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { NodeCircleProgram } from "sigma/rendering";
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";

import { fitCameraToNodes, type NodeBoundsGraph } from "./cameraFit.js";
import { stabilizeFileAnchors, toFadedColor } from "./graphBuild.js";
import { computeHoverNeighborhood, type HoverNeighborhood } from "./graphHover.js";
import { computeSelection } from "./graphTraversal.js";
import { dimColor } from "./lensColor.js";
import type { GraphViewStore } from "../state/graphViewStore.js";
import type {
  GraphEdgeAttributes,
  GraphNodeAttributes,
  SelectionTraversal,
  ThemeColors,
  TracePhase,
} from "./graphViewTypes.js";

// Border-program for entry-classified nodes — the gold-bordered treatment from
// slice 026. Identical config to the inline GraphView definition it replaces.
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

const SINGLE_CLICK_DELAY_MS = 180;
const FORCE_ATLAS2_ITERATIONS = 200;
const MINIMAP_MIN_NODES = 20;

// Camera tunables — identical to the values the inline GraphView handlers used,
// kept here so the controller's camera math is self-contained and testable.
const ZOOM_IN_FACTOR = 0.7;
const ZOOM_OUT_FACTOR = 1.4;
const ZOOM_BUTTON_DURATION_MS = 200;
const ZOOM_RESET_DURATION_MS = 300;

// Neighbourhood radius for hover/selection traversal — matches the value the
// inline GraphView effect used (FLOW_MAX_DEPTH).
const NEIGHBOURHOOD_MAX_DEPTH = 4;

/** Structural view of the Sigma camera surface the controller drives. */
interface CameraSurface {
  animate?: (
    state: { x: number; y: number; ratio: number },
    options?: { duration?: number },
  ) => void;
  getState?: () => { x: number; y: number; ratio: number };
}

type SigmaWithCamera = Sigma & { getCamera?: () => CameraSurface };

/**
 * Construction options for {@link SigmaController}. These carry the imperative
 * inputs the controller needs that are *not* part of the view-membership store:
 * the decorator-backed id set and the lens emphasis inputs were previously held
 * as component refs and read by the Sigma reducers. They are passed in (and
 * updated via setters) rather than read from React, because the reducers run
 * outside the React render cycle.
 */
export interface SigmaControllerOptions {
  /** Reads theme tokens at mount/refresh time (kept injectable for tests). */
  readThemeColors: () => ThemeColors;
  /**
   * Called whenever the active overlay selection changes (hover begins/ends,
   * a node is selected/cleared). React owns the SVG traveler overlay, so the
   * controller hands it the selection to render — `null` clears the overlay.
   * The component builds the segments from its own sigma/graph handles.
   */
  onOverlayUpdate: (selection: SelectionTraversal | null) => void;
}

/**
 * React-side glue the controller invokes from the Sigma event listeners and
 * render hooks it owns. Keeps DOM/React concerns (navigation, the canvas
 * overlays read from React refs, theme application that also touches container
 * style) in the component while the controller owns the Sigma lifecycle.
 */
export interface SigmaMountCallbacks {
  /** Open the editor at a node's source location (double-click). */
  onNavigate: (filePath: string, startLine: number) => void;
  /** A single click committed selection — React updates the Inspector. */
  onSelect: (nodeId: string) => void;
  /** The stage was clicked — clear selection. */
  onClear: () => void;
  /** A node was clicked while a trace phase awaits a pick. */
  onTracePick: (nodeId: string) => void;
  /** Apply theme to the graph + container and return the resolved colors. */
  applyTheme: () => ThemeColors;
  /** Rebuild the React SVG overlay from the controller's current selection. */
  updateOverlay: () => void;
  /** Resize the cluster canvas to the container (called from the ResizeObserver). */
  onResize: () => void;
  /** Draw the cluster hulls + minimap (afterRender) using React-held canvas refs. */
  onAfterRender: () => void;
}

/**
 * Owns the imperative Sigma layer that resisted mechanical extraction during
 * `visibleview-foundation`: the Sigma instance, the graphology graph handle, and
 * the transient interaction state (hover/selection neighbourhoods, the trace
 * phase + path sets, the depth-visible set, the decorator-backed set) that the
 * once-registered node/edge reducers read on every render.
 *
 * The controller reads *view-membership* (hidden kinds, lens, depth inputs) from
 * the injected {@link GraphViewStore} via `getState()` — never from React — the
 * same way the inline reducers do today. React keeps ownership of the *display*
 * surfaces (Inspector, trace banner); the controller mirrors selection/trace for
 * *rendering*. This is a React-free plain class so the imperative layer is
 * directly unit-testable for the first time.
 *
 * Built strangler-style: methods are added as each responsibility migrates off
 * the inline mount effect, with the webview suite green at every step.
 */
export class SigmaController {
  private readonly store: GraphViewStore;
  private readonly options: SigmaControllerOptions;

  private sigma: Sigma | null = null;
  private graph: MultiDirectedGraph | null = null;
  private container: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  // Pending single-click selection, cancelled if a double-click fires first.
  private clickTimeout: number | null = null;

  // Transient interaction state — momentary appearance, not view membership.
  // These mirror the component refs the reducers read today; they migrate onto
  // the controller phase by phase.
  private hoverNeighborhood: HoverNeighborhood | null = null;
  private hoverSelection: SelectionTraversal | null = null;
  private selection: SelectionTraversal | null = null;
  private hoveredNodeId: string | null = null;
  private tracePhase: TracePhase = "idle";
  private pathNodeIds: Set<string> = new Set();
  private pathEdgeIds: Set<string> = new Set();
  private depthVisibleNodeIds: Set<string> | null = null;
  private decoratorBackedNodeIds: Set<string> = new Set();
  private matchedNodeIds: ReadonlySet<string> = new Set();
  private lensMatchSet: ReadonlySet<string> | null = null;
  private lensColorOf: ((archLayer: string | undefined) => string | null) | null = null;
  // Theme colors the reducers read for dim/recolour/emphasis. Captured at
  // applyTheme time (mirrors the inline reducers closing over `colors`).
  private colors: ThemeColors | null = null;

  constructor(store: GraphViewStore, options: SigmaControllerOptions) {
    this.store = store;
    this.options = options;
  }

  /** The live Sigma instance, or null before mount / after dispose. */
  get instance(): Sigma | null {
    return this.sigma;
  }

  /** The live graphology graph handle, or null before mount / after dispose. */
  get graphHandle(): MultiDirectedGraph | null {
    return this.graph;
  }

  /**
   * Adopt an externally-constructed Sigma instance + graph. Phase 1 keeps the
   * inline mount effect as the constructor of Sigma; the controller is handed
   * the result so subsequent phases can move operations onto it. Later phases
   * fold construction itself into the controller.
   */
  adopt(sigma: Sigma, graph: MultiDirectedGraph, container: HTMLDivElement): void {
    this.sigma = sigma;
    this.graph = graph;
    this.container = container;
  }

  /** Force a Sigma re-render (re-runs the reducers). No-op before mount. */
  refresh(): void {
    const maybeRefresh = this.sigma as unknown as { refresh?: () => void } | null;
    maybeRefresh?.refresh?.();
  }

  /**
   * Zoom the camera in by one step (smaller ratio = closer). No-op when there is
   * no instance or the camera lacks the animate/getState surface.
   */
  zoomIn(): void {
    this.animateZoomBy(ZOOM_IN_FACTOR);
  }

  /** Zoom the camera out by one step (larger ratio = farther). */
  zoomOut(): void {
    this.animateZoomBy(ZOOM_OUT_FACTOR);
  }

  /**
   * Frame every node in the viewport. Mirrors the Fit button: needs the live
   * instance, container, and graph; no-ops if any is missing.
   */
  zoomFit(): void {
    if (this.sigma === null || this.container === null || this.graph === null) {
      return;
    }
    fitCameraToNodes(
      this.sigma as SigmaWithCamera,
      this.container,
      this.graph as unknown as NodeBoundsGraph,
    );
  }

  /** Reset the camera to the default centred view at ratio 1. */
  zoomReset(): void {
    const camera = (this.sigma as SigmaWithCamera | null)?.getCamera?.();
    camera?.animate?.({ x: 0.5, y: 0.5, ratio: 1 }, { duration: ZOOM_RESET_DURATION_MS });
  }

  private animateZoomBy(factor: number): void {
    const camera = (this.sigma as SigmaWithCamera | null)?.getCamera?.();
    const state = camera?.getState?.();
    if (camera?.animate !== undefined && state !== undefined) {
      camera.animate(
        { x: state.x, y: state.y, ratio: state.ratio * factor },
        { duration: ZOOM_BUTTON_DURATION_MS },
      );
    }
  }

  /** The node currently hovered, or null. Read by the afterRender hull draw. */
  get hoveredNode(): string | null {
    return this.hoveredNodeId;
  }

  /** The active hover neighbourhood, or null. Read by the node/edge reducers. */
  get hover(): HoverNeighborhood | null {
    return this.hoverNeighborhood;
  }

  /** The active selection traversal, or null. Read by the reducers + overlay. */
  get currentSelection(): SelectionTraversal | null {
    return this.selection;
  }

  /**
   * Begin or end a hover. Passing a node id computes its hover neighbourhood and
   * full traversal (matching the inline `enterNode` listener); passing null
   * clears them (the `leaveNode` listener). Refreshes Sigma so the reducers
   * re-run, and — only when nothing is selected — pushes the hover (or cleared)
   * overlay to React. No-op before mount.
   */
  setHover(nodeId: string | null): void {
    const graph = this.graph;
    if (graph === null) {
      return;
    }
    if (nodeId === null) {
      this.hoveredNodeId = null;
      this.hoverNeighborhood = null;
      this.hoverSelection = null;
    } else {
      this.hoveredNodeId = nodeId;
      this.hoverNeighborhood = computeHoverNeighborhood(graph, nodeId);
      this.hoverSelection = computeSelection(graph, nodeId, NEIGHBOURHOOD_MAX_DEPTH);
    }
    this.refresh();
    // A committed selection's overlay always wins over hover. With a selection
    // active, entering/leaving a node restores the selection overlay; with no
    // selection, hover drives the overlay (or clears it on leave).
    if (this.selection !== null) {
      this.options.onOverlayUpdate(this.selection);
    } else {
      this.options.onOverlayUpdate(nodeId === null ? null : this.hoverSelection);
    }
  }

  /**
   * Commit or clear the selection's render mirror. React remains the source of
   * truth for the Inspector (the component still calls setSelectedNodeId); this
   * owns the traversal the reducers read and the selection overlay. Refreshes
   * Sigma and pushes the overlay. No-op before mount for the traversal compute,
   * but still clears state so a pre-mount clear is safe.
   */
  /** The active trace phase. Read by the reducers + the clickNode routing. */
  get tracePhaseState(): TracePhase {
    return this.tracePhase;
  }

  /** On-path node ids for the active trace. Read by the node reducer. */
  get tracePathNodeIds(): ReadonlySet<string> {
    return this.pathNodeIds;
  }

  /** On-path edge ids for the active trace. Read by the edge reducer. */
  get tracePathEdgeIds(): ReadonlySet<string> {
    return this.pathEdgeIds;
  }

  /**
   * Eagerly set just the trace phase. The handlers update the phase *before*
   * React commits so the synchronous Sigma clickNode routing reads the new
   * phase immediately (the inline code wrote `tracePhaseRef.current` for this).
   * Does not refresh — the subsequent setTracePath (via the React sync effect)
   * does, matching the inline behavior.
   */
  setTracePhase(phase: TracePhase): void {
    this.tracePhase = phase;
  }

  /**
   * Mirror the full trace state the reducers read: phase + on-path node/edge id
   * sets. Called from the React sync effect after `traceState` commits, then
   * refreshes Sigma so the path dimming/highlight applies. React stays the
   * source for the banner/rails/inspector.
   */
  setTracePath(
    phase: TracePhase,
    pathNodeIds: Iterable<string>,
    pathEdgeIds: Iterable<string>,
  ): void {
    this.tracePhase = phase;
    this.pathNodeIds = new Set(pathNodeIds);
    this.pathEdgeIds = new Set(pathEdgeIds);
    this.refresh();
  }

  /** Theme colors the reducers read. Captured each time the theme is applied. */
  setColors(colors: ThemeColors): void {
    this.colors = colors;
  }

  /** Node ids flagged decorator-backed (hidden when the Decorator chip is off). */
  setDecoratorBackedNodeIds(ids: Set<string>): void {
    this.decoratorBackedNodeIds = ids;
    this.refresh();
  }

  /**
   * The depth-visible node id set (union of anchor neighbourhoods), or null when
   * the depth filter is inactive (show all). Refreshes so the reducer re-runs.
   */
  setDepthVisibleNodeIds(ids: Set<string> | null): void {
    this.depthVisibleNodeIds = ids;
    this.refresh();
  }

  /** Search-matched node ids (non-matches dim when the set is non-empty). */
  setMatchedNodeIds(ids: ReadonlySet<string>): void {
    this.matchedNodeIds = ids;
    this.refresh();
  }

  /** Active match-lens id set (non-matches dim), or null when no match lens. */
  setLensMatchSet(set: ReadonlySet<string> | null): void {
    this.lensMatchSet = set;
    this.refresh();
  }

  /** Active recolour-lens colour fn, or null when no recolour lens is active. */
  setLensColorOf(colorOf: ((archLayer: string | undefined) => string | null) | null): void {
    this.lensColorOf = colorOf;
    this.refresh();
  }

  setSelection(nodeId: string | null, opts: { updateOverlay?: boolean } = {}): void {
    const graph = this.graph;
    this.selection =
      nodeId === null || graph === null
        ? null
        : computeSelection(graph, nodeId, NEIGHBOURHOOD_MAX_DEPTH);
    this.refresh();
    // The canvas-click + clear paths refresh the overlay; the search/lens-row
    // fly-to path historically did not (it only set the ref + refreshed), so
    // callers opt in. Defaults to true to match the common case.
    if (opts.updateOverlay !== false) {
      this.options.onOverlayUpdate(this.selection);
    }
  }

  /**
   * The Sigma node reducer. Bound as a field so it can be handed to `new Sigma`
   * directly. Reads view-membership from the store and emphasis from the
   * controller's own fields — a faithful move of the inline reducer, branch for
   * branch, so behavior is preserved.
   */
  readonly nodeReducer = (node: string, raw: Attributes): Partial<NodeDisplayData> => {
    const data = raw as GraphNodeAttributes;
    const colors = this.colors;
    const hiddenNodeKinds = this.store.getState().hiddenNodeKinds;

    // 1. Node-kind filter (applied first — hides node before hover/focus logic).
    const kindKey = data.nodeKind === "file" ? "file" : (data.symbolKind ?? "function");
    if (hiddenNodeKinds.has(kindKey)) {
      return { ...data, hidden: true };
    }
    // Decorator chip: decorator-backed nodes hide like any node-kind filter.
    if (hiddenNodeKinds.has("decorator") && this.decoratorBackedNodeIds.has(node)) {
      return { ...data, hidden: true };
    }

    // 2. Depth filter — hide nodes outside the depth-N neighbourhood.
    if (this.depthVisibleNodeIds !== null && !this.depthVisibleNodeIds.has(node)) {
      return { ...data, hidden: true };
    }

    // 3. Trace dimming — off-path nodes dim; trace wins over search/lens.
    if (this.tracePhase === "path-active" && this.pathNodeIds.size > 0) {
      if (!this.pathNodeIds.has(node)) {
        return { ...data, color: dimColor(String(data.color)), label: "" };
      }
      return data;
    }

    const hover = this.hoverNeighborhood;
    const selection = this.selection;
    const activeFocus = hover ?? selection;

    if (activeFocus === null || activeFocus.nodeIds.has(node)) {
      if (selection !== null && hover === null && selection.selectedNodeId === node) {
        return { ...data, size: Number(data.baseSize ?? data.size) * 1.28, zIndex: 2 };
      }

      // No hover/selection focus — search dimming first, then lens dimming.
      if (activeFocus === null) {
        if (this.matchedNodeIds.size > 0 && !this.matchedNodeIds.has(node)) {
          return { ...data, color: dimColor(String(data.color)), label: "" };
        }
        if (this.lensMatchSet !== null && !this.lensMatchSet.has(node)) {
          return { ...data, color: dimColor(String(data.color)) };
        }
        // Architecture (recolour) lens — recolour by layer; null keeps base.
        if (this.lensColorOf !== null) {
          const layerColorValue = this.lensColorOf(data.archLayer as string | undefined);
          if (layerColorValue !== null) {
            return { ...data, color: layerColorValue };
          }
        }
      }

      return data;
    }

    return {
      ...data,
      color: toFadedColor(
        data.baseColor ?? data.color,
        colors?.disabledColor ?? String(data.color),
      ),
      label: "",
    };
  };

  /**
   * The Sigma edge reducer. Bound field for the same reason as nodeReducer; a
   * faithful move of the inline edge reducer reading the store + controller
   * fields + graph (for direction-aware CALLS emphasis).
   */
  readonly edgeReducer = (edge: string, raw: Attributes): Partial<EdgeDisplayData> => {
    const data = raw as GraphEdgeAttributes;
    const colors = this.colors;
    const graph = this.graph;
    const hover = this.hoverNeighborhood;
    const selection = this.selection;

    // Hide edges whose kind is toggled off by the filter bar (store-backed).
    if (this.store.getState().hiddenEdgeKinds.has(data.edgeKind)) {
      return { ...data, hidden: true };
    }

    // Trace path styling — on-path edges bold yellow; off-path dim. Wins over
    // hover/selection. Distinction is colour + size, never an edge `type`.
    if (this.tracePhase === "path-active" && this.pathEdgeIds.size > 0) {
      if (this.pathEdgeIds.has(edge)) {
        return {
          ...data,
          color: colors?.tracePathEdgeColor ?? String(data.color),
          size: Number(data.baseSize ?? data.size) * 1.6,
          zIndex: 1,
        };
      }
      return {
        ...data,
        color: toFadedColor(
          data.baseColor ?? data.color,
          colors?.disabledColor ?? String(data.color),
        ),
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
        // Direction-aware CALLS emphasis: colour a selected node's inbound calls
        // (callers) distinctly from its outbound calls (callees).
        if (data.edgeKind === "CALLS" && graph !== null && colors !== null) {
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
      color: toFadedColor(
        data.baseColor ?? data.color,
        colors?.disabledColor ?? String(data.color),
      ),
      size: Math.max(Number(data.baseSize ?? data.size) * 0.72, 1),
    };
  };

  /**
   * Construct and mount the Sigma renderer onto a container for a prepared graph,
   * wiring layout, theme, the node/edge reducers, interaction listeners, the
   * resize + theme observers, and the afterRender overlay draw. The component
   * keeps graph construction and the WebGL/fallback decision; this owns the
   * imperative Sigma lifecycle. Throws if Sigma construction fails (the caller
   * renders the static fallback). Returns the live instance.
   */
  mount(
    container: HTMLDivElement,
    graph: MultiDirectedGraph,
    callbacks: SigmaMountCallbacks,
  ): Sigma {
    // Run the force-directed layout before constructing Sigma so the first paint
    // is already settled. Layout failure is non-fatal — render the raw positions.
    if (graph.order > 0) {
      try {
        forceAtlas2.assign(graph, {
          iterations: FORCE_ATLAS2_ITERATIONS,
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

    const sigma = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderLabels: true,
      renderEdgeLabels: false,
      // Labels hidden for tiny/distant nodes, revealed on zoom-in. File nodes
      // stay labelled at all zoom levels; small symbol nodes appear ≥ 4px wide.
      labelRenderedSizeThreshold: 4,
      defaultNodeType: "circle",
      defaultEdgeType: "line",
      defaultEdgeColor: this.options.readThemeColors().definesEdgeColor,
      enableEdgeEvents: true,
      // Prevent built-in double-click zoom — navigation is manual via clickNode.
      doubleClickZoomingRatio: 1,
      // Explicitly include circle (replacing nodeProgramClasses overrides the
      // default mapping in Sigma 3). Square is for architectural-layer
      // differentiation; entry is the gold-bordered classification treatment.
      nodeProgramClasses: {
        circle: NodeCircleProgram,
        square: NodeSquareProgram,
        entry: NodeEntryProgram,
      },
      nodeReducer: this.nodeReducer,
      edgeReducer: this.edgeReducer,
    });

    this.sigma = sigma;
    this.graph = graph;
    this.container = container;
    this.colors = callbacks.applyTheme();

    this.resizeObserver = new ResizeObserver(() => {
      callbacks.onResize();
      this.refresh();
      callbacks.updateOverlay();
    });
    this.resizeObserver.observe(container);

    sigma.on("clickNode", (event) => {
      // Trace mode takes priority over normal selection. When a trace phase
      // awaits a pick, route the click to the state machine and short-circuit.
      if (this.tracePhase === "picking-start" || this.tracePhase === "picking-end") {
        callbacks.onTracePick(event.node);
        return;
      }
      // Queue single-click selection; doubleClickNode cancels it on a real
      // double-click.
      if (this.clickTimeout !== null) {
        window.clearTimeout(this.clickTimeout);
      }
      this.clickTimeout = window.setTimeout(() => {
        this.clickTimeout = null;
        callbacks.onSelect(event.node);
      }, SINGLE_CLICK_DELAY_MS);
    });

    sigma.on("doubleClickNode", (event) => {
      if (this.clickTimeout !== null) {
        window.clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }
      const preventable = event as unknown as { preventSigmaDefault?: () => void };
      preventable.preventSigmaDefault?.();
      const attrs = graph.getNodeAttributes(event.node) as GraphNodeAttributes;
      callbacks.onNavigate(attrs.filePath, attrs.startLine);
    });

    sigma.on("clickStage", () => {
      if (this.clickTimeout !== null) {
        window.clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }
      callbacks.onClear();
    });

    sigma.on("enterNode", (event) => this.setHover(event.node));
    sigma.on("leaveNode", () => this.setHover(null));
    sigma.on("afterRender", () => callbacks.onAfterRender());

    this.themeObserver = new MutationObserver(() => {
      this.colors = callbacks.applyTheme();
      callbacks.updateOverlay();
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return sigma;
  }

  /** Whether the minimap should draw given the current graph order. */
  shouldDrawMinimap(): boolean {
    return this.graph !== null && this.graph.order > MINIMAP_MIN_NODES;
  }

  /**
   * Tear down the Sigma instance and drop all imperative state. Idempotent: safe
   * to call without a prior mount and safe to call more than once.
   */
  dispose(): void {
    if (this.clickTimeout !== null) {
      window.clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.sigma?.kill();
    this.sigma = null;
    this.graph = null;
    this.container = null;
    this.hoverNeighborhood = null;
    this.hoverSelection = null;
    this.selection = null;
    this.hoveredNodeId = null;
    this.tracePhase = "idle";
    this.pathNodeIds = new Set();
    this.pathEdgeIds = new Set();
    this.depthVisibleNodeIds = null;
    this.decoratorBackedNodeIds = new Set();
    this.matchedNodeIds = new Set();
    this.lensMatchSet = null;
    this.lensColorOf = null;
    this.colors = null;
  }
}
