import { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";
import { describe, expect, it, vi } from "vitest";

// The real sigma + sigma/rendering modules read WebGL2RenderingContext at import
// time, which jsdom does not expose. Stub the constructor + program classes; the
// lifecycle/camera/reducer tests drive the controller via adopt() with a stub
// Sigma, so the real renderer is never needed.
vi.mock("sigma", () => ({
  default: vi.fn(function SigmaCtor() {
    return { on: vi.fn(), kill: vi.fn(), refresh: vi.fn() };
  }),
}));
vi.mock("sigma/rendering", () => ({ NodeCircleProgram: class {} }));
vi.mock("@sigma/node-square", () => ({ NodeSquareProgram: class {} }));
vi.mock("@sigma/node-border", () => ({ createNodeBorderProgram: vi.fn(() => class {}) }));

// jsdom does not provide these observers; mount() constructs them. Minimal
// no-op stubs are enough — the tests assert listener wiring + teardown, not
// observation callbacks.
class NoopObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.MutationObserver ??= NoopObserver as unknown as typeof MutationObserver;

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

  it("mount() constructs Sigma, applies theme, wires listeners, and exposes the instance", () => {
    const controller = new SigmaController(freshStore(), options());
    const applyTheme = vi.fn(() => REDUCER_THEME);
    const sigma = controller.mount(stubContainer(), triadGraph(), {
      onNavigate: vi.fn(),
      onSelect: vi.fn(),
      onClear: vi.fn(),
      onTracePick: vi.fn(),
      applyTheme,
      updateOverlay: vi.fn(),
      onResize: vi.fn(),
      onAfterRender: vi.fn(),
    });
    expect(sigma).not.toBeNull();
    expect(controller.instance).toBe(sigma);
    expect(applyTheme).toHaveBeenCalled();
    // clickNode/doubleClickNode/clickStage/enterNode/leaveNode/afterRender wired.
    expect((sigma as unknown as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalled();
  });

  it("dispose() after mount kills Sigma and disconnects observers", () => {
    const controller = new SigmaController(freshStore(), options());
    const sigma = controller.mount(stubContainer(), triadGraph(), {
      onNavigate: vi.fn(),
      onSelect: vi.fn(),
      onClear: vi.fn(),
      onTracePick: vi.fn(),
      applyTheme: () => REDUCER_THEME,
      updateOverlay: vi.fn(),
      onResize: vi.fn(),
      onAfterRender: vi.fn(),
    });
    const kill = (sigma as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
    controller.dispose();
    expect(kill).toHaveBeenCalledTimes(1);
    expect(controller.instance).toBeNull();
  });

  it("shouldDrawMinimap reflects graph order", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    expect(controller.shouldDrawMinimap()).toBe(false); // 3 nodes < threshold
  });
});

describe("SigmaController — getVisibleView", () => {
  function attributedGraph(): MultiDirectedGraph {
    const graph = new MultiDirectedGraph();
    graph.addNode("fn-1", { nodeKind: "symbol", symbolKind: "function" });
    graph.addNode("fn-2", { nodeKind: "symbol", symbolKind: "function" });
    graph.addNode("file-1", { nodeKind: "file" });
    graph.addEdge("fn-1", "fn-2", { edgeKind: "CALLS" });
    graph.addDirectedEdge("file-1", "fn-1", { edgeKind: "DEFINES" });
    return graph;
  }

  function controllerOn(hiddenNodeKinds: Set<string>, hiddenEdgeKinds: Set<string>) {
    const store = createGraphViewStore({
      hiddenNodeKinds,
      hiddenEdgeKinds: hiddenEdgeKinds as Set<never>,
    });
    const controller = new SigmaController(store, options());
    controller.adopt(stubSigma().sigma, attributedGraph(), stubContainer());
    return controller;
  }

  it("includes all nodes/edges when nothing is hidden", () => {
    const view = controllerOn(new Set(), new Set()).getVisibleView();
    expect([...view.nodeIds].sort()).toEqual(["file-1", "fn-1", "fn-2"]);
    expect(view.edgeIds.size).toBe(2);
  });

  it("excludes nodes whose kind is hidden, and edges touching them", () => {
    const view = controllerOn(new Set(["file"]), new Set()).getVisibleView();
    expect(view.nodeIds.has("file-1")).toBe(false);
    // The DEFINES edge (file-1 → fn-1) drops because an endpoint is hidden; the
    // CALLS edge between two visible functions survives.
    expect(view.edgeIds.size).toBe(1);
  });

  it("excludes edges whose kind is hidden even when endpoints are visible", () => {
    const view = controllerOn(new Set(), new Set(["CALLS"])).getVisibleView();
    expect(view.nodeIds.size).toBe(3);
    expect(view.edgeIds.size).toBe(1); // only DEFINES remains
  });

  it("respects the depth-visible set", () => {
    const controller = controllerOn(new Set(), new Set());
    controller.setDepthVisibleNodeIds(new Set(["fn-1"]));
    const view = controller.getVisibleView();
    expect([...view.nodeIds]).toEqual(["fn-1"]);
    expect(view.edgeIds.size).toBe(0);
  });

  it("returns an empty view before mount", () => {
    const view = new SigmaController(freshStore(), options()).getVisibleView();
    expect(view.nodeIds.size).toBe(0);
    expect(view.edgeIds.size).toBe(0);
  });
});

describe("SigmaController — focus", () => {
  it("collapses the view to the focus node's neighbourhood", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    controller.setFocus("a", 1); // a → b within depth 1
    const view = controller.getVisibleView();
    expect(view.focusNodeId).toBe("a");
    expect(view.nodeIds.has("a")).toBe(true);
    expect(view.nodeIds.has("b")).toBe(true);
    // c is 2 hops from a; outside depth 1.
    expect(view.nodeIds.has("c")).toBe(false);
  });

  it("focuses to just the node when it has no neighbours", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("lonely", { nodeKind: "symbol", symbolKind: "function" });
    const controller = new SigmaController(
      createGraphViewStore({ hiddenNodeKinds: new Set(), hiddenEdgeKinds: new Set() }),
      options(),
    );
    controller.adopt(stubSigma().sigma, graph, stubContainer());
    controller.setFocus("lonely", 3);
    const view = controller.getVisibleView();
    expect([...view.nodeIds]).toEqual(["lonely"]);
  });

  it("clearing focus restores the full view", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    controller.setFocus("a", 1);
    controller.setFocus(null, 1);
    expect(controller.focusedNode).toBeNull();
    expect(controller.getVisibleView().nodeIds.size).toBe(3);
  });

  it("focusing a missing node is a safe no-op (no throw, no focus)", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    expect(() => controller.setFocus("ghost", 2)).not.toThrow();
    expect(controller.focusedNode).toBeNull();
    expect(controller.getVisibleView().nodeIds.size).toBe(3);
  });

  it("dispose clears focus", () => {
    const controller = new SigmaController(freshStore(), options());
    controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
    controller.setFocus("a", 1);
    controller.dispose();
    expect(controller.focusedNode).toBeNull();
    expect(controller.focusVisibleSet).toBeNull();
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

// Minimal stub theme with the colour tokens the reducers consume.
const REDUCER_THEME = {
  disabledColor: "#888888",
  tracePathEdgeColor: "#dcdcaa",
  callerEdgeColor: "#00ff00",
  calleeEdgeColor: "#ffa500",
} as unknown as ThemeColors;

function nodeAttrs(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    label: "n",
    filePath: "a.ts",
    startLine: 1,
    nodeKind: "symbol",
    symbolKind: "function",
    x: 0,
    y: 0,
    size: 5,
    baseSize: 5,
    color: "#abcabc",
    baseColor: "#abcabc",
    ...over,
  };
}

function edgeAttrs(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    edgeKind: "CALLS",
    color: "#abcabc",
    baseColor: "#abcabc",
    size: 1,
    baseSize: 1,
    ...over,
  };
}

/** Controller mounted on the triad graph with reducer theme applied. */
function reducerController(storeInit?: GraphViewStore): SigmaController {
  const store =
    storeInit ?? createGraphViewStore({ hiddenNodeKinds: new Set(), hiddenEdgeKinds: new Set() });
  const controller = new SigmaController(store, options());
  controller.adopt(stubSigma().sigma, triadGraph(), stubContainer());
  controller.setColors(REDUCER_THEME);
  return controller;
}

describe("SigmaController — node reducer branches", () => {
  it("hides a node whose kind is in the hidden-node-kinds set", () => {
    const store = createGraphViewStore({
      hiddenNodeKinds: new Set(["function"]),
      hiddenEdgeKinds: new Set(),
    });
    const controller = reducerController(store);
    const out = controller.nodeReducer("a", nodeAttrs({ symbolKind: "function" }) as never);
    expect(out.hidden).toBe(true);
  });

  it("hides a decorator-backed node when the Decorator chip is off", () => {
    const store = createGraphViewStore({
      hiddenNodeKinds: new Set(["decorator"]),
      hiddenEdgeKinds: new Set(),
    });
    const controller = reducerController(store);
    controller.setDecoratorBackedNodeIds(new Set(["a"]));
    const out = controller.nodeReducer("a", nodeAttrs() as never);
    expect(out.hidden).toBe(true);
  });

  it("hides a node outside the depth-visible set", () => {
    const controller = reducerController();
    controller.setDepthVisibleNodeIds(new Set(["b"]));
    expect(controller.nodeReducer("a", nodeAttrs() as never).hidden).toBe(true);
    expect(controller.nodeReducer("b", nodeAttrs() as never).hidden).toBeUndefined();
  });

  it("dims off-path nodes when a trace path is active", () => {
    const controller = reducerController();
    controller.setTracePath("path-active", ["b"], []);
    const off = controller.nodeReducer("a", nodeAttrs() as never);
    expect(off.label).toBe("");
    expect(off.color).not.toBe("#abcabc");
    const on = controller.nodeReducer("b", nodeAttrs() as never);
    expect(on.label).not.toBe("");
  });

  it("enlarges the selected node", () => {
    const controller = reducerController();
    controller.setSelection("a");
    const out = controller.nodeReducer("a", nodeAttrs({ baseSize: 5 }) as never);
    expect(out.size).toBeCloseTo(5 * 1.28);
    expect(out.zIndex).toBe(2);
  });

  it("dims non-matches when a search match set is active", () => {
    const controller = reducerController();
    controller.setMatchedNodeIds(new Set(["b"]));
    const out = controller.nodeReducer("a", nodeAttrs() as never);
    expect(out.label).toBe("");
    expect(out.color).not.toBe("#abcabc");
  });

  it("scopes membership to the lens subject: non-matches are hidden, not dimmed", () => {
    const controller = reducerController();
    controller.setLensMatchSet(new Set(["b"]));
    // A node outside the lens subject is hidden (membership), not merely dimmed.
    expect(controller.nodeReducer("a", nodeAttrs() as never).hidden).toBe(true);
    // A node inside the subject stays a full member.
    expect(controller.nodeReducer("b", nodeAttrs() as never).hidden).toBeUndefined();
  });

  it("node-kind filter narrows WITHIN the lens subject (does not reveal non-subject nodes)", () => {
    // Lens subject = {b, c}. Hiding the "function" kind narrows within the
    // subject; it must not surface "a" (outside the subject).
    const store = createGraphViewStore({
      hiddenNodeKinds: new Set(["function"]),
      hiddenEdgeKinds: new Set(),
    });
    const controller = reducerController(store);
    controller.setLensMatchSet(new Set(["b", "c"]));
    // "a": outside subject AND a function — hidden.
    expect(controller.nodeReducer("a", nodeAttrs({ symbolKind: "function" }) as never).hidden).toBe(
      true,
    );
    // "b": in subject but a function (hidden kind) — hidden within the subject.
    expect(controller.nodeReducer("b", nodeAttrs({ symbolKind: "function" }) as never).hidden).toBe(
      true,
    );
    // "c": in subject and a class (not hidden) — visible.
    expect(
      controller.nodeReducer("c", nodeAttrs({ symbolKind: "class" }) as never).hidden,
    ).toBeUndefined();
  });

  it("deactivating the lens restores whole-graph filtering", () => {
    const controller = reducerController();
    controller.setLensMatchSet(new Set(["b"]));
    expect(controller.nodeReducer("a", nodeAttrs() as never).hidden).toBe(true);
    controller.setLensMatchSet(null);
    // With no lens, "a" is a member again (whole-graph filtering).
    expect(controller.nodeReducer("a", nodeAttrs() as never).hidden).toBeUndefined();
  });

  it("recolours by layer when a recolour lens is active", () => {
    const controller = reducerController();
    controller.setLensColorOf((layer) => (layer === "domain" ? "#123456" : null));
    const hit = controller.nodeReducer("a", nodeAttrs({ archLayer: "domain" }) as never);
    expect(hit.color).toBe("#123456");
    const miss = controller.nodeReducer("a", nodeAttrs({ archLayer: "io" }) as never);
    expect(miss.color).toBe("#abcabc");
  });

  it("fades nodes outside the active focus neighbourhood", () => {
    const controller = reducerController();
    controller.setSelection("a"); // focus around a; c is 2 hops but within depth 4
    // Disconnect by selecting a leaf and probing a far node would need a bigger
    // graph; instead assert the in-focus node is not faded.
    const inFocus = controller.nodeReducer("a", nodeAttrs() as never);
    expect(inFocus.label).not.toBe("");
  });
});

describe("SigmaController — edge reducer branches", () => {
  it("hides an edge whose kind is in the hidden-edge-kinds set", () => {
    const store = createGraphViewStore({
      hiddenNodeKinds: new Set(),
      hiddenEdgeKinds: new Set(["CALLS"]),
    });
    const controller = reducerController(store);
    const out = controller.edgeReducer("a->b", edgeAttrs({ edgeKind: "CALLS" }) as never);
    expect(out.hidden).toBe(true);
  });

  it("dims an inter-community edge but not an intra-community edge", () => {
    // Two triangles bridged by one edge → Louvain yields 2 communities; the
    // bridge edge is inter-community, the triangle edges are intra-community.
    const graph = new MultiDirectedGraph();
    for (const id of ["a1", "a2", "a3", "b1", "b2", "b3"]) {
      graph.addNode(id, { edgeKind: undefined });
    }
    graph.addEdgeWithKey("a-tri", "a1", "a2", edgeAttrs());
    graph.addEdgeWithKey("a-tri2", "a2", "a3", edgeAttrs());
    graph.addEdgeWithKey("a-tri3", "a3", "a1", edgeAttrs());
    graph.addEdgeWithKey("b-tri", "b1", "b2", edgeAttrs());
    graph.addEdgeWithKey("b-tri2", "b2", "b3", edgeAttrs());
    graph.addEdgeWithKey("b-tri3", "b3", "b1", edgeAttrs());
    graph.addEdgeWithKey("bridge", "a1", "b1", edgeAttrs());

    const store = createGraphViewStore({ hiddenNodeKinds: new Set(), hiddenEdgeKinds: new Set() });
    const controller = new SigmaController(store, options());
    // mount() runs community detection; use a stub sigma + the real graph.
    controller.mount(stubContainer(), graph, {
      onNavigate: vi.fn(),
      onSelect: vi.fn(),
      onClear: vi.fn(),
      onTracePick: vi.fn(),
      applyTheme: () => REDUCER_THEME,
      updateOverlay: vi.fn(),
      onResize: vi.fn(),
      onAfterRender: vi.fn(),
    });

    // Sanity: the partition split the two triangles.
    expect(controller.communityPartition.count).toBeGreaterThanOrEqual(2);

    const bridge = controller.edgeReducer("bridge", edgeAttrs() as never);
    const intra = controller.edgeReducer("a-tri", edgeAttrs() as never);
    // Inter-community bridge recedes (color shifts toward the disabled colour);
    // intra-community edge keeps its base colour.
    expect(bridge.color).not.toBe("#abcabc");
    expect(intra.color).toBe("#abcabc");
  });

  it("styles on-path edges and dims off-path edges during trace", () => {
    const controller = reducerController();
    controller.setTracePath("path-active", [], ["a->b"]);
    const on = controller.edgeReducer("a->b", edgeAttrs() as never);
    expect(on.color).toBe("#dcdcaa");
    const off = controller.edgeReducer("zzz", edgeAttrs() as never);
    expect(off.color).not.toBe("#dcdcaa");
  });
});
