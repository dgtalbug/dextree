import type { FocusedNode } from "./focusedGraphModel.js";

/**
 * Deterministic positions for the focused view: the focus node at the origin,
 * each BFS ring on a concentric circle of increasing radius. Pure (no React Flow
 * runtime, no DOM) so it is unit-testable; `FocusedGraphView` feeds the result
 * into React Flow node positions.
 *
 * Deterministic-not-force because focused graphs are small and read better with a
 * stable centre+rings than a re-simulated blob — mirrors the Sigma radial-on-
 * select layout.
 */

export interface XY {
  x: number;
  y: number;
}

/** Pixel radius of the first ring; each further ring steps out by this much. */
export const FOCUSED_RING_SPACING = 220;

/**
 * Assign an `{x,y}` to every focused node. Ring 0 (the focus node) goes to the
 * origin; nodes sharing a ring are spread evenly around that ring's circle.
 * Order within a ring follows the input order (already importance-ranked by the
 * model), so the most important neighbours get stable, predictable angles.
 */
export function computeFocusedLayout(nodes: readonly FocusedNode[]): Map<string, XY> {
  const positions = new Map<string, XY>();

  // Bucket node ids by ring, preserving input order.
  const ringBuckets = new Map<number, string[]>();
  for (const node of nodes) {
    const bucket = ringBuckets.get(node.ring);
    if (bucket === undefined) ringBuckets.set(node.ring, [node.id]);
    else bucket.push(node.id);
  }

  for (const [ring, ids] of ringBuckets) {
    if (ring === 0) {
      // Focus node(s) at the origin (there is normally exactly one).
      for (const id of ids) positions.set(id, { x: 0, y: 0 });
      continue;
    }
    const radius = ring * FOCUSED_RING_SPACING;
    for (let i = 0; i < ids.length; i++) {
      const angle = (2 * Math.PI * i) / ids.length;
      positions.set(ids[i]!, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
  }

  return positions;
}
