import type { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";

import { fitCameraToNodes, type NodeBoundsGraph } from "./cameraFit.js";
import { computeHoverNeighborhood, type HoverNeighborhood } from "./graphHover.js";
import { computeSelection } from "./graphTraversal.js";
import type { GraphViewStore } from "../state/graphViewStore.js";
import type { SelectionTraversal, ThemeColors, TracePhase } from "./graphViewTypes.js";

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
   * Tear down the Sigma instance and drop all imperative state. Idempotent: safe
   * to call without a prior mount and safe to call more than once.
   */
  dispose(): void {
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
  }
}
