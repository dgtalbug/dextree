import { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";
import { describe, expect, it, vi } from "vitest";

import { drawClusterHulls, drawMinimap } from "./graphOverlay.js";

/**
 * Canvas-driving tests for the overlay renderers. They run in the jsdom (webview)
 * project and pass a spy 2D context + a stub Sigma so the drawing paths and their
 * early-return guards are exercised without a real WebGL/canvas backend.
 */

type Ctx2D = Record<string, ReturnType<typeof vi.fn> | string | number>;

function makeContext(): Ctx2D {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
}

function makeCanvas(ctx: Ctx2D | null): HTMLCanvasElement {
  return {
    width: 200,
    height: 120,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

/** Stub Sigma: identity-ish viewport mapping + a fixed camera centre. */
function makeSigma(): Sigma {
  return {
    graphToViewport: ({ x, y }: { x: number; y: number }) => ({ x: x * 10, y: y * 10 }),
    getCamera: () => ({ getState: () => ({ x: 2, y: 2, ratio: 1 }) }),
  } as unknown as Sigma;
}

/** Three symbols in one file (enough to form a hull) plus the file node. */
function hullGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("file", { nodeKind: "file", filePath: "a.ts", baseColor: "#112233", x: 0, y: 0 });
  graph.addNode("s1", { nodeKind: "symbol", filePath: "a.ts", x: 1, y: 0, color: "#445566" });
  graph.addNode("s2", { nodeKind: "symbol", filePath: "a.ts", x: 3, y: 0, color: "#445566" });
  graph.addNode("s3", { nodeKind: "symbol", filePath: "a.ts", x: 2, y: 3, color: "#445566" });
  return graph;
}

describe("drawClusterHulls", () => {
  it("no-ops when the canvas has no 2D context", () => {
    expect(() =>
      drawClusterHulls(hullGraph(), makeSigma(), makeCanvas(null), null, null),
    ).not.toThrow();
  });

  it("clears the canvas and strokes a hull for a 3+ symbol file", () => {
    const ctx = makeContext();
    drawClusterHulls(hullGraph(), makeSigma(), makeCanvas(ctx) as HTMLCanvasElement, null, null);

    expect(ctx.clearRect).toHaveBeenCalled();
    // A hull of 3 points is filled and stroked.
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalled();
  });

  it("clears but draws no hull when a file has fewer than 3 symbols", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("file", { nodeKind: "file", filePath: "a.ts", baseColor: "#112233" });
    graph.addNode("s1", { nodeKind: "symbol", filePath: "a.ts", x: 1, y: 1, color: "#445566" });

    const ctx = makeContext();
    drawClusterHulls(graph, makeSigma(), makeCanvas(ctx) as HTMLCanvasElement, null, null);

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("groups by community when a partition is supplied (3 cross-file members → one hull)", () => {
    // Three symbols across DIFFERENT files but in the SAME community: under file
    // grouping this is 3 singletons (no hull); under community grouping it is one
    // group of 3 → a hull is drawn.
    const graph = new MultiDirectedGraph();
    graph.addNode("s1", { nodeKind: "symbol", filePath: "a.ts", x: 1, y: 0, color: "#445566" });
    graph.addNode("s2", { nodeKind: "symbol", filePath: "b.ts", x: 3, y: 0, color: "#445566" });
    graph.addNode("s3", { nodeKind: "symbol", filePath: "c.ts", x: 2, y: 3, color: "#445566" });
    const community = new Map([
      ["s1", 0],
      ["s2", 0],
      ["s3", 0],
    ]);

    const ctx = makeContext();
    drawClusterHulls(
      graph,
      makeSigma(),
      makeCanvas(ctx) as HTMLCanvasElement,
      null,
      null,
      community,
    );

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("excludes nodes outside the visible set from the hull", () => {
    // Same community of 3, but one member is filtered out → only 2 visible → no
    // hull (needs 3+ points).
    const graph = new MultiDirectedGraph();
    graph.addNode("s1", { nodeKind: "symbol", filePath: "a.ts", x: 1, y: 0, color: "#445566" });
    graph.addNode("s2", { nodeKind: "symbol", filePath: "b.ts", x: 3, y: 0, color: "#445566" });
    graph.addNode("s3", { nodeKind: "symbol", filePath: "c.ts", x: 2, y: 3, color: "#445566" });
    const community = new Map([
      ["s1", 0],
      ["s2", 0],
      ["s3", 0],
    ]);
    const visible = new Set(["s1", "s2"]); // s3 filtered out

    const ctx = makeContext();
    drawClusterHulls(
      graph,
      makeSigma(),
      makeCanvas(ctx) as HTMLCanvasElement,
      null,
      null,
      community,
      visible,
    );

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

describe("drawMinimap", () => {
  const container = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLDivElement;

  it("no-ops when the canvas has no 2D context", () => {
    expect(() => drawMinimap(hullGraph(), makeSigma(), makeCanvas(null), container)).not.toThrow();
  });

  it("renders node dots and the camera crosshair when nodes have finite coords", () => {
    const ctx = makeContext();
    drawMinimap(hullGraph(), makeSigma(), makeCanvas(ctx) as HTMLCanvasElement, container);

    expect(ctx.clearRect).toHaveBeenCalled();
    // One arc per node dot, plus one for the camera crosshair.
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
    expect(ctx.stroke).toHaveBeenCalled(); // crosshair stroke
  });

  it("no-ops when fewer than two nodes have finite coordinates", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("only", { nodeKind: "file", filePath: "a.ts", x: 1, y: 1, color: "#112233" });

    const ctx = makeContext();
    drawMinimap(graph, makeSigma(), makeCanvas(ctx) as HTMLCanvasElement, container);

    // Bounds collapse → early return before any fill.
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
