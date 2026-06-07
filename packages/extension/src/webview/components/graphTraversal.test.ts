import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { computeSelection, computeTracePath } from "./graphTraversal.js";
import { TRACE_STATE_IDLE, type TraceState } from "./graphViewTypes.js";

/**
 *   a ──CALLS──▶ b ──CALLS──▶ c
 *   │ DEFINES
 *   ▼
 *   d
 */
function buildGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("a", { filePath: "src/a.ts", framework: "react" });
  graph.addNode("b", { filePath: "src/b.ts", framework: "react" });
  graph.addNode("c", { filePath: "src/c.ts", framework: "express" });
  graph.addNode("d", { filePath: "src/a.ts" });

  graph.addEdgeWithKey("a-b", "a", "b", { edgeKind: "CALLS" });
  graph.addEdgeWithKey("b-c", "b", "c", { edgeKind: "CALLS" });
  graph.addEdgeWithKey("a-d", "a", "d", { edgeKind: "DEFINES" });
  return graph;
}

describe("computeSelection", () => {
  it("returns null for a null or unknown selection", () => {
    const graph = buildGraph();
    expect(computeSelection(graph, null, 2)).toBeNull();
    expect(computeSelection(graph, "missing", 2)).toBeNull();
  });

  it("collects the depth-1 outbound neighbourhood of the anchor", () => {
    const result = computeSelection(buildGraph(), "a", 1);

    expect(result).not.toBeNull();
    expect(result!.selectedNodeId).toBe("a");
    // a's direct outbound targets: b (CALLS) and d (DEFINES).
    expect(result!.nodeIds).toEqual(new Set(["a", "b", "d"]));
    expect(result!.edgeIds).toEqual(new Set(["a-b", "a-d"]));
  });

  it("expands further with greater depth", () => {
    const result = computeSelection(buildGraph(), "a", 2);

    // Now c (reachable via b) is included.
    expect(result!.nodeIds.has("c")).toBe(true);
    expect(result!.edgeIds.has("b-c")).toBe(true);
  });

  it("records per-hop EDGE layers in hopLayers", () => {
    const result = computeSelection(buildGraph(), "a", 2);

    expect(result!.hopLayers.length).toBeGreaterThanOrEqual(1);
    expect(result!.hopLayers[0]).toEqual(expect.arrayContaining(["a-b", "a-d"]));
  });

  it("records per-hop NODE layers in nodeLayers (layer 0 = selected node)", () => {
    const result = computeSelection(buildGraph(), "a", 2);

    // This is the contract the radial-on-select layout depends on: nodeLayers
    // holds NODE ids by depth, not edges. Layer 0 is the selected node alone.
    expect(result!.nodeLayers[0]).toEqual(["a"]);
    expect(result!.nodeLayers[1]).toEqual(expect.arrayContaining(["b", "d"]));
    expect(result!.nodeLayers[2]).toEqual(["c"]);
    // Every entry must be a real node, never an edge id.
    for (const layer of result!.nodeLayers) {
      for (const id of layer) {
        expect(buildGraph().hasNode(id)).toBe(true);
      }
    }
  });
});

describe("computeTracePath", () => {
  it("returns null when the trace state has no path", () => {
    expect(computeTracePath(buildGraph(), TRACE_STATE_IDLE)).toBeNull();
  });

  it("summarises a populated path: hops, file count, framework boundary", () => {
    const state: TraceState = {
      ...TRACE_STATE_IDLE,
      phase: "path-active",
      startNodeId: "a",
      endNodeId: "c",
      pathNodeIds: ["a", "b", "c"],
      pathEdgeIds: ["a-b", "b-c"],
    };

    const path = computeTracePath(buildGraph(), state);

    expect(path).not.toBeNull();
    expect(path!.startNodeId).toBe("a");
    expect(path!.endNodeId).toBe("c");
    expect(path!.hopCount).toBe(2);
    // Three distinct files (a.ts, b.ts, c.ts).
    expect(path!.fileCount).toBe(3);
    // react (a,b) + express (c) → crosses a framework boundary.
    expect(path!.crossesFrameworkBoundary).toBe(true);
    expect(path!.nodeIds).toEqual(["a", "b", "c"]);
    expect(path!.edgeIds).toEqual(["a-b", "b-c"]);
  });

  it("does not flag a framework boundary within a single framework", () => {
    const state: TraceState = {
      ...TRACE_STATE_IDLE,
      phase: "path-active",
      startNodeId: "a",
      endNodeId: "b",
      pathNodeIds: ["a", "b"],
      pathEdgeIds: ["a-b"],
    };

    const path = computeTracePath(buildGraph(), state);

    expect(path!.crossesFrameworkBoundary).toBe(false);
  });
});
