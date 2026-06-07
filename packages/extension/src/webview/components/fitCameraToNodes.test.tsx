import { describe, expect, it, vi } from "vitest";

import { fitCameraToNodes } from "./cameraFit.js";

/**
 * A sigma stub exposing the surface fitCameraToNodes uses: a camera with
 * `animatedReset` and a top-level `refresh`. The helper delegates framing to
 * Sigma (normalized space) rather than animating to raw graph coordinates —
 * that hand-rolled math sent the camera to empty space for any layout that
 * relocated nodes (the Circular/Hierarchical "graph vanished" bug).
 */
function makeSigma() {
  const animatedReset = vi.fn();
  const refresh = vi.fn();
  const sigma = {
    refresh,
    getCamera: () => ({ animatedReset }),
  } as unknown as Parameters<typeof fitCameraToNodes>[0];
  return { sigma, animatedReset, refresh };
}

function makeGraph(order: number) {
  return { order };
}

const CONTAINER = { clientWidth: 800, clientHeight: 600 };

describe("fitCameraToNodes", () => {
  it("frames a populated graph via the camera's animatedReset", () => {
    const { sigma, animatedReset, refresh } = makeSigma();
    fitCameraToNodes(sigma, CONTAINER, makeGraph(3));
    // Refresh first (recompute bounds for the new layout), then reset-to-fit.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(animatedReset).toHaveBeenCalledTimes(1);
  });

  it("passes through the animation duration", () => {
    const { sigma, animatedReset } = makeSigma();
    fitCameraToNodes(sigma, CONTAINER, makeGraph(2), 500);
    expect(animatedReset).toHaveBeenCalledWith({ duration: 500 });
  });

  it("does not move the camera for an empty graph", () => {
    const { sigma, animatedReset, refresh } = makeSigma();
    fitCameraToNodes(sigma, CONTAINER, makeGraph(0));
    expect(refresh).not.toHaveBeenCalled();
    expect(animatedReset).not.toHaveBeenCalled();
  });
});
