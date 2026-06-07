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
export const FOCUSED_RING_SPACING = 280;
/**
 * Minimum perimeter (px) reserved per card on a ring. A card is up to ~220px
 * wide; reserving more than that as arc keeps neighbouring cards from touching,
 * so dense rings expand outward instead of overlapping.
 */
export const FOCUSED_MIN_ARC_PER_NODE = 260;

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
    // Grow the ring radius with the node count so each card keeps a minimum arc
    // of perimeter — otherwise a dense ring packs cards on top of each other
    // (the opposite of "clean"). radius = max(ring spacing, perimeter need).
    const minRadius = ring * FOCUSED_RING_SPACING;
    const perimeterNeed = (ids.length * FOCUSED_MIN_ARC_PER_NODE) / (2 * Math.PI);
    const radius = Math.max(minRadius, perimeterNeed);
    for (let i = 0; i < ids.length; i++) {
      const angle = (2 * Math.PI * i) / ids.length;
      positions.set(ids[i]!, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
  }

  return positions;
}
