import { describe, expect, it, vi } from "vitest";

import { fitCameraToNodes } from "./cameraFit.js";

interface FakeCameraState {
  x: number;
  y: number;
  ratio: number;
}

/** A sigma stub exposing only the camera surface fitCameraToNodes uses. */
function makeSigma(animate: (state: FakeCameraState, opts?: { duration?: number }) => void) {
  return {
    getCamera: () => ({ animate }),
  } as unknown as Parameters<typeof fitCameraToNodes>[0];
}

/** A graph stub with the minimal node-bounds surface. */
function makeGraph(nodes: ReadonlyArray<{ x: number; y: number }>) {
  return {
    order: nodes.length,
    forEachNode(cb: (node: string, attrs: { x: number; y: number }) => void) {
      nodes.forEach((n, i) => cb(`n${i}`, n));
    },
  };
}

describe("fitCameraToNodes", () => {
  it("centres the camera on the node bounding box", () => {
    const animate = vi.fn();
    const sigma = makeSigma(animate);
    const container = { clientWidth: 800, clientHeight: 600 };
    // Nodes spanning x:[-100, 300], y:[-50, 150] → centre (100, 50).
    const graph = makeGraph([
      { x: -100, y: -50 },
      { x: 300, y: 150 },
      { x: 0, y: 0 },
    ]);

    fitCameraToNodes(sigma, container, graph);

    expect(animate).toHaveBeenCalledTimes(1);
    const target = animate.mock.calls[0][0] as FakeCameraState;
    expect(target.x).toBe(100);
    expect(target.y).toBe(50);
    // Ratio derives from the larger of width/height fit; must be positive and
    // not the floor (the graph is wider than the 0.1 minimum implies).
    expect(target.ratio).toBeGreaterThan(0.1);
  });

  it("does not move the camera for an empty graph", () => {
    const animate = vi.fn();
    fitCameraToNodes(makeSigma(animate), { clientWidth: 800, clientHeight: 600 }, makeGraph([]));
    expect(animate).not.toHaveBeenCalled();
  });

  it("frames an off-origin cluster so the camera does not stay at the origin", () => {
    // Reproduces the hierarchical-empty-page bug: nodes far from origin must
    // pull the camera centre away from (0,0).
    const animate = vi.fn();
    const graph = makeGraph([
      { x: 4000, y: 4000 },
      { x: 4200, y: 4200 },
    ]);
    fitCameraToNodes(makeSigma(animate), { clientWidth: 800, clientHeight: 600 }, graph);
    const target = animate.mock.calls[0][0] as FakeCameraState;
    expect(target.x).toBe(4100);
    expect(target.y).toBe(4100);
  });
});
