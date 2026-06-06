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

function options(overrides: Partial<SigmaControllerOptions> = {}): SigmaControllerOptions {
  return { readThemeColors: () => STUB_THEME, onOverlayUpdate: vi.fn(), ...overrides };
}

/** A tiny connected graph: a → b → c, so traversals produce non-empty sets. */
function triadGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("a", { x: 0, y: 0 });
  graph.addNode("b", { x: 1, y: 1 });
  graph.addNode("c", { x: 2, y: 2 });
  graph.addEdge("a", "b");
  graph.addEdge("b", "c");
  return graph;
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

describe("SigmaController — hover", () => {
  it("setHover computes the hover neighbourhood, refreshes, and pushes the overlay", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    const { sigma, refresh } = stubSigma();
    controller.adopt(sigma, triadGraph(), stubContainer());

    controller.setHover("b");

    expect(controller.hoveredNode).toBe("b");
    expect(controller.hover).not.toBeNull();
    expect(refresh).toHaveBeenCalled();
    // No committed selection → hover drives the overlay with a non-null traversal.
    expect(onOverlayUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ nodeIds: expect.anything() }),
    );
  });

  it("setHover(null) clears hover state and the overlay when nothing is selected", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());

    controller.setHover("b");
    controller.setHover(null);

    expect(controller.hoveredNode).toBeNull();
    expect(controller.hover).toBeNull();
    expect(onOverlayUpdate).toHaveBeenLastCalledWith(null);
  });

  it("a committed selection's overlay wins over hover enter/leave", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());

    controller.setSelection("a");
    const selection = controller.currentSelection;
    onOverlayUpdate.mockClear();

    controller.setHover("c");
    expect(onOverlayUpdate).toHaveBeenLastCalledWith(selection);
    controller.setHover(null);
    expect(onOverlayUpdate).toHaveBeenLastCalledWith(selection);
  });

  it("setHover is a no-op before mount (no graph)", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    expect(() => controller.setHover("a")).not.toThrow();
    expect(controller.hoveredNode).toBeNull();
    expect(onOverlayUpdate).not.toHaveBeenCalled();
  });
});

describe("SigmaController — selection", () => {
  it("setSelection computes the traversal, refreshes, and pushes the overlay", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    const { sigma, refresh } = stubSigma();
    controller.adopt(sigma, triadGraph(), stubContainer());

    controller.setSelection("b");

    expect(controller.currentSelection).not.toBeNull();
    expect(controller.currentSelection?.selectedNodeId).toBe("b");
    expect(refresh).toHaveBeenCalled();
    expect(onOverlayUpdate).toHaveBeenCalledWith(controller.currentSelection);
  });

  it("setSelection(null) clears selection and the overlay", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());

    controller.setSelection("b");
    controller.setSelection(null);

    expect(controller.currentSelection).toBeNull();
    expect(onOverlayUpdate).toHaveBeenLastCalledWith(null);
  });

  it("setSelection with updateOverlay:false sets the traversal but skips the overlay", () => {
    const onOverlayUpdate = vi.fn();
    const controller = new SigmaController(freshStore(), options({ onOverlayUpdate }));
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());

    controller.setSelection("b", { updateOverlay: false });

    expect(controller.currentSelection?.selectedNodeId).toBe("b");
    expect(onOverlayUpdate).not.toHaveBeenCalled();
  });

  it("dispose clears hover + selection render state", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    controller.setSelection("a");
    controller.setHover("b");

    controller.dispose();

    expect(controller.currentSelection).toBeNull();
    expect(controller.hover).toBeNull();
    expect(controller.hoveredNode).toBeNull();
  });
});

describe("SigmaController — trace", () => {
  it("starts idle with empty path sets", () => {
    const controller = new SigmaController(freshStore(), options());
    expect(controller.tracePhaseState).toBe("idle");
    expect(controller.tracePathNodeIds.size).toBe(0);
    expect(controller.tracePathEdgeIds.size).toBe(0);
  });

  it("setTracePhase updates the phase eagerly without refreshing", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, refresh } = stubSigma();
    controller.adopt(sigma, triadGraph(), stubContainer());

    controller.setTracePhase("picking-start");

    expect(controller.tracePhaseState).toBe("picking-start");
    // Eager phase set mirrors the inline `tracePhaseRef.current = ...` write,
    // which did not refresh — the subsequent setTracePath does.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("setTracePath mirrors phase + path sets and refreshes", () => {
    const controller = new SigmaController(freshStore(), options());
    const { sigma, refresh } = stubSigma();
    controller.adopt(sigma, triadGraph(), stubContainer());

    controller.setTracePath("path-active", ["a", "b", "c"], ["a->b", "b->c"]);

    expect(controller.tracePhaseState).toBe("path-active");
    expect([...controller.tracePathNodeIds]).toEqual(["a", "b", "c"]);
    expect([...controller.tracePathEdgeIds]).toEqual(["a->b", "b->c"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("setTracePath copies the iterables (later mutation does not leak in)", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    const nodes = new Set(["a"]);
    controller.setTracePath("path-active", nodes, []);
    nodes.add("b");
    expect(controller.tracePathNodeIds.has("b")).toBe(false);
  });

  it("dispose resets trace state to idle + empty", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    controller.setTracePath("path-active", ["a"], ["a->b"]);

    controller.dispose();

    expect(controller.tracePhaseState).toBe("idle");
    expect(controller.tracePathNodeIds.size).toBe(0);
    expect(controller.tracePathEdgeIds.size).toBe(0);
  });
});
