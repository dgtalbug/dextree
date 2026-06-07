/**
 * Camera-framing helper, extracted from GraphView so it can be unit-tested
 * without importing the WebGL-coupled Sigma renderer.
 *
 * It delegates to Sigma's own `camera.animatedReset()`, which frames the whole
 * graph in Sigma's *normalized* coordinate space. An earlier version did the
 * bounding-box math by hand and animated the camera to raw graph coordinates —
 * but the Sigma camera operates in normalized space, so any layout that moved
 * nodes into a different coordinate range (Circular's ring, Hierarchical's
 * layers, the radial-on-select rings) sent the camera to empty space and the
 * graph vanished. `animatedReset` is correct by construction for any layout.
 */

/** The camera surface this helper drives (a structural subset of Sigma's). */
export interface FitCameraTarget {
  getCamera?: () => {
    animatedReset?: (options?: { duration?: number }) => unknown;
  };
  /** Recompute node bounds before reset so the fit reflects the latest layout. */
  refresh?: () => void;
}

/** Minimal structural view of the graph needed to detect the empty-graph no-op. */
export interface NodeBoundsGraph {
  order: number;
}

/**
 * Frame every node in the viewport by resetting Sigma's camera to fit the graph.
 * Shared by the Fit-to-view button and the layout-preset handler so a preset
 * that repositions nodes into a new coordinate range does not leave the camera
 * looking at empty space. No-ops on an empty graph or a sigma without a camera.
 *
 * `_container` is retained for call-site compatibility; Sigma computes the fit
 * from its own viewport, so the helper no longer needs the container size.
 */
export function fitCameraToNodes(
  sigma: FitCameraTarget,
  _container: { clientWidth: number; clientHeight: number },
  graph: NodeBoundsGraph,
  durationMs = 300,
): void {
  if (graph.order === 0) return;
  // Refresh first so Sigma recomputes its graph→viewport ratio from the new node
  // positions; animatedReset then frames that updated bounding box.
  sigma.refresh?.();
  sigma.getCamera?.()?.animatedReset?.({ duration: durationMs });
}
