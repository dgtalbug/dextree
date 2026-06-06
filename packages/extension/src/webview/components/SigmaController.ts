import type { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";

import { fitCameraToNodes, type NodeBoundsGraph } from "./cameraFit.js";
import type { HoverNeighborhood } from "./graphHover.js";
import type { GraphViewStore } from "../state/graphViewStore.js";
import type { SelectionTraversal, ThemeColors, TracePhase } from "./graphViewTypes.js";

// Camera tunables — identical to the values the inline GraphView handlers used,
// kept here so the controller's camera math is self-contained and testable.
const ZOOM_IN_FACTOR = 0.7;
const ZOOM_OUT_FACTOR = 1.4;
const ZOOM_BUTTON_DURATION_MS = 200;
const ZOOM_RESET_DURATION_MS = 300;

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
