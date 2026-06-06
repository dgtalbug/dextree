import { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";
import { describe, expect, it, vi } from "vitest";

import { SigmaController, type SigmaControllerOptions } from "./SigmaController.js";
import { createGraphViewStore, type GraphViewStore } from "../state/graphViewStore.js";
import type { ThemeColors } from "./graphViewTypes.js";

const STUB_THEME = {} as ThemeColors;

function freshStore(): GraphViewStore {
  return createGraphViewStore({
    hiddenNodeKinds: new Set(["file"]),
    hiddenEdgeKinds: new Set(["DEFINES"]),
  });
}

function options(): SigmaControllerOptions {
  return { readThemeColors: () => STUB_THEME };
}

/**
 * Minimal Sigma camera stub: records the last animate() call and reports a
 * fixed state. Mirrors the structural surface the controller drives so we can
 * assert the camera math without a live WebGL renderer.
 */
function stubSigma(initial = { x: 0.4, y: 0.6, ratio: 2 }) {
  const animate = vi.fn();
  const kill = vi.fn();
  const refresh = vi.fn();
  const camera = {
    animate,
    getState: () => initial,
  };
  const sigma = {
    kill,
    refresh,
    getCamera: () => camera,
  } as unknown as Sigma;
  return { sigma, animate, kill, refresh };
}

function stubContainer(): HTMLDivElement {
  return { clientWidth: 800, clientHeight: 600 } as HTMLDivElement;
}

describe("SigmaController — lifecycle", () => {
  it("starts with no instance, graph, or container", () => {
    const controller = new SigmaController(freshStore(), options());
    expect(controller.instance).toBeNull();
    expect(controller.graphHandle).toBeNull();
  });

  it("adopt() exposes the instance and graph", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma } = stubSigma();
    const graph = new MultiDirectedGraph();
    controller.adopt(sigma, graph, stubContainer());
    expect(controller.instance).toBe(sigma);
    expect(controller.graphHandle).toBe(graph);
  });

  it("dispose() kills Sigma and clears the handles", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, kill } = stubSigma();
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.dispose();
    expect(kill).toHaveBeenCalledTimes(1);
    expect(controller.instance).toBeNull();
    expect(controller.graphHandle).toBeNull();
  });

  it("dispose() is idempotent and safe before any mount", () => {
    const controller = new SigmaController(freshStore(), options());
    expect(() => controller.dispose()).not.toThrow();
    const { sigma, kill } = stubSigma();
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.dispose();
    controller.dispose();
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("refresh() is a no-op before mount and re-renders after", () => {
    const controller = new SigmaController(freshStore(), options());
    expect(() => controller.refresh()).not.toThrow();
    const { sigma, refresh } = stubSigma();
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.refresh();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("SigmaController — camera operations", () => {
  it("zoomIn multiplies the ratio by 0.7 at the current centre", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, animate } = stubSigma({ x: 0.4, y: 0.6, ratio: 2 });
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.zoomIn();
    expect(animate).toHaveBeenCalledWith({ x: 0.4, y: 0.6, ratio: 2 * 0.7 }, { duration: 200 });
  });

  it("zoomOut multiplies the ratio by 1.4 at the current centre", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, animate } = stubSigma({ x: 0.4, y: 0.6, ratio: 2 });
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.zoomOut();
    expect(animate).toHaveBeenCalledWith({ x: 0.4, y: 0.6, ratio: 2 * 1.4 }, { duration: 200 });
  });

  it("zoomReset recentres to (0.5, 0.5) at ratio 1", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, animate } = stubSigma();
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.zoomReset();
    expect(animate).toHaveBeenCalledWith({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 300 });
  });

  it("zoomFit frames the populated graph via the camera", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, animate } = stubSigma();
    const graph = new MultiDirectedGraph();
    graph.addNode("a", { x: 0, y: 0 });
    graph.addNode("b", { x: 10, y: 10 });
    controller.adopt(sigma, graph, stubContainer());
    controller.zoomFit();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("zoomFit is a no-op on an empty graph", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, animate } = stubSigma();
    controller.adopt(sigma, new MultiDirectedGraph(), stubContainer());
    controller.zoomFit();
    expect(animate).not.toHaveBeenCalled();
  });

  it("camera ops are no-ops before mount", () => {
    const controller = new SigmaController(freshStore(), options());
    expect(() => {
      controller.zoomIn();
      controller.zoomOut();
      controller.zoomFit();
      controller.zoomReset();
    }).not.toThrow();
  });
});
