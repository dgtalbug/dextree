import type { GraphEdge } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { deriveVisibleView, type VisibleViewInputs } from "./deriveVisibleView.js";

/**
 * Build a small typed graph mirroring the production node/edge attributes the
 * derivation reads: `nodeKind`/`symbolKind`/`decoratorBacked` on nodes,
 * `edgeKind` on edges.
 *
 *   file-a ──IMPORTS──▶ file-b
 *     │ DEFINES              │ DEFINES
 *     ▼                      ▼
 *   fn-a1 ────CALLS────▶ method-b1
 */
function buildGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("file-a", { nodeKind: "file" });
  graph.addNode("file-b", { nodeKind: "file" });
  graph.addNode("fn-a1", { nodeKind: "symbol", symbolKind: "function" });
  graph.addNode("method-b1", { nodeKind: "symbol", symbolKind: "method" });

  graph.addEdgeWithKey("imp-1", "file-a", "file-b", { edgeKind: "IMPORTS" });
  graph.addEdgeWithKey("def-a1", "file-a", "fn-a1", { edgeKind: "DEFINES" });
  graph.addEdgeWithKey("def-b1", "file-b", "method-b1", { edgeKind: "DEFINES" });
  graph.addEdgeWithKey("call-1", "fn-a1", "method-b1", { edgeKind: "CALLS" });
  return graph;
}

function inputs(overrides: Partial<VisibleViewInputs> = {}): VisibleViewInputs {
  return {
    hiddenNodeKinds: new Set<string>(),
    hiddenEdgeKinds: new Set<GraphEdge["kind"]>(),
    depth: 3,
    activeLensId: null,
    selectedNodeId: null,
    depthVisibleNodeIds: null,
    focusNodeId: null,
    ...overrides,
  };
}

describe("deriveVisibleView", () => {
  it("includes every node and edge when no filter is active", () => {
    const view = deriveVisibleView(buildGraph(), inputs());

    expect(view.nodeIds).toEqual(new Set(["file-a", "file-b", "fn-a1", "method-b1"]));
    expect(view.edgeIds).toEqual(new Set(["imp-1", "def-a1", "def-b1", "call-1"]));
  });

  it("returns empty membership for an empty graph", () => {
    const view = deriveVisibleView(new MultiDirectedGraph(), inputs());

    expect(view.nodeIds.size).toBe(0);
    expect(view.edgeIds.size).toBe(0);
  });

  it("excludes nodes whose kind is hidden, and edges touching them", () => {
    const view = deriveVisibleView(buildGraph(), inputs({ hiddenNodeKinds: new Set(["file"]) }));

    // Both file nodes drop out; only the two symbols remain.
    expect(view.nodeIds).toEqual(new Set(["fn-a1", "method-b1"]));
    // Every edge except fn-a1→method-b1 touched a file node, so only call-1 survives.
    expect(view.edgeIds).toEqual(new Set(["call-1"]));
  });

  it("defaults an absent symbolKind to the 'function' filter key", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("mystery", { nodeKind: "symbol" }); // no symbolKind

    const view = deriveVisibleView(graph, inputs({ hiddenNodeKinds: new Set(["function"]) }));

    expect(view.nodeIds.has("mystery")).toBe(false);
  });

  it("hides decorator-backed nodes only when the Decorator chip is off", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("plain", { nodeKind: "symbol", symbolKind: "class" });
    graph.addNode("decorated", {
      nodeKind: "symbol",
      symbolKind: "class",
      decoratorBacked: true,
    });

    const shown = deriveVisibleView(graph, inputs());
    expect(shown.nodeIds).toEqual(new Set(["plain", "decorated"]));

    const hidden = deriveVisibleView(graph, inputs({ hiddenNodeKinds: new Set(["decorator"]) }));
    expect(hidden.nodeIds).toEqual(new Set(["plain"]));
  });

  it("limits membership to the depth-visible set when depth is active", () => {
    const view = deriveVisibleView(
      buildGraph(),
      inputs({ depthVisibleNodeIds: new Set(["fn-a1", "method-b1"]) }),
    );

    expect(view.nodeIds).toEqual(new Set(["fn-a1", "method-b1"]));
    // Only the edge fully inside the depth set survives.
    expect(view.edgeIds).toEqual(new Set(["call-1"]));
  });

  it("treats a null depth-visible set as 'show all' (depth inactive)", () => {
    const view = deriveVisibleView(buildGraph(), inputs({ depthVisibleNodeIds: null }));

    expect(view.nodeIds.size).toBe(4);
  });

  it("hides edges whose kind is filtered off but keeps their endpoints", () => {
    const view = deriveVisibleView(
      buildGraph(),
      inputs({ hiddenEdgeKinds: new Set<GraphEdge["kind"]>(["CALLS"]) }),
    );

    // Nodes are unaffected by an edge-kind filter.
    expect(view.nodeIds.size).toBe(4);
    // call-1 is the only CALLS edge — it drops; the rest remain.
    expect(view.edgeIds).toEqual(new Set(["imp-1", "def-a1", "def-b1"]));
  });

  it("passes through the input lens / depth / focus onto the derived view", () => {
    const view = deriveVisibleView(
      buildGraph(),
      inputs({ activeLensId: "god-function", depth: 2, focusNodeId: "fn-a1" }),
    );

    expect(view.activeLensId).toBe("god-function");
    expect(view.depth).toBe(2);
    expect(view.focusNodeId).toBe("fn-a1");
  });

  it("is deterministic — same inputs yield equal membership", () => {
    const a = deriveVisibleView(buildGraph(), inputs({ hiddenNodeKinds: new Set(["file"]) }));
    const b = deriveVisibleView(buildGraph(), inputs({ hiddenNodeKinds: new Set(["file"]) }));

    expect(a.nodeIds).toEqual(b.nodeIds);
    expect(a.edgeIds).toEqual(b.edgeIds);
  });
});
