/**
 * Spread layout — adapted from arc-sdk's `canvasLayout.ts`.
 *
 * For diagrams authored as markdown <ArchDiagram :nodes :edges />, the node
 * positions are computed from the optional `col`/`row` fields. The spread
 * variant scales every node outward from the centroid by a constant factor,
 * which lets the user "open up" a dense diagram without losing its layout.
 *
 * Pure function. No Vue, no Vue Flow imports. Inputs are `{ id, x, y, width,
 * height }` records; outputs are the same shape with shifted positions.
 */

export interface Positioned {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Scale node positions outward from the centroid of all nodes by `factor`.
 * `factor` of 1.0 is a no-op; 1.18 matches arc-sdk's docs spread; 1.4 is
 * their default for standalone canvas pages.
 */
export function spreadPositions<T extends Positioned>(nodes: T[], factor = 1.18): T[] {
  if (nodes.length === 0 || factor === 1) {
    return nodes;
  }

  let centroidX = 0;
  let centroidY = 0;

  for (const node of nodes) {
    centroidX += node.position.x + node.width / 2;
    centroidY += node.position.y + node.height / 2;
  }

  centroidX /= nodes.length;
  centroidY /= nodes.length;

  return nodes.map((node) => {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;

    return {
      ...node,
      position: {
        x: centroidX + (centerX - centroidX) * factor - node.width / 2,
        y: centroidY + (centerY - centroidY) * factor - node.height / 2,
      },
    };
  });
}
