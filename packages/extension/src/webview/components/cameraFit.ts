/**
 * Camera-framing helper, extracted from GraphView so it can be unit-tested
 * without importing the WebGL-coupled Sigma renderer. Pure: depends only on
 * its arguments.
 */

/** The camera surface this helper drives (a structural subset of Sigma's). */
export interface FitCameraTarget {
  getCamera?: () => {
    animate?: (
      state: { x: number; y: number; ratio: number },
      options?: { duration?: number },
    ) => void;
  };
}

/** Minimal structural view of the graph needed to compute node bounds. */
export interface NodeBoundsGraph {
  order: number;
  forEachNode(cb: (node: string, attrs: { x: number; y: number }) => void): void;
}

/**
 * Frame every node in the viewport by animating the camera to the node
 * bounding box's centre at a ratio that fits it with padding. Shared by the
 * Fit-to-view button and the layout-preset handler so a preset that
 * repositions nodes into a new coordinate range (e.g. Hierarchical's
 * origin-centred layers) does not leave the camera looking at empty space.
 * No-ops on an empty graph or a sigma without a camera.
 */
export function fitCameraToNodes(
  sigma: FitCameraTarget,
  container: { clientWidth: number; clientHeight: number },
  graph: NodeBoundsGraph,
  durationMs = 300,
): void {
  if (graph.order === 0) return;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  graph.forEachNode((_node, attrs) => {
    if (attrs.x < minX) minX = attrs.x;
    if (attrs.x > maxX) maxX = attrs.x;
    if (attrs.y < minY) minY = attrs.y;
    if (attrs.y > maxY) maxY = attrs.y;
  });
  const padding = 40;
  const width = container.clientWidth - padding * 2;
  const height = container.clientHeight - padding * 2;
  const graphWidth = maxX - minX + 1;
  const graphHeight = maxY - minY + 1;
  const ratio = Math.max(graphWidth / width, graphHeight / height, 0.1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  sigma.getCamera?.()?.animate?.({ x: centerX, y: centerY, ratio }, { duration: durationMs });
}
