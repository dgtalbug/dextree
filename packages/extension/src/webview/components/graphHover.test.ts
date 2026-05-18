import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { computeHoverNeighborhood } from "./graphHover.js";

function buildGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("file-a");
  graph.addNode("file-b");
  graph.addNode("file-c");
  graph.addNode("symbol-a1");
  graph.addNode("isolated");

  graph.addEdgeWithKey("e1", "file-a", "symbol-a1");
  graph.addEdgeWithKey("e2", "file-a", "file-b");
  graph.addEdgeWithKey("e3", "file-c", "file-a");
  return graph;
}

describe("computeHoverNeighborhood", () => {
  it("returns the hovered node plus its 1-hop neighbors in both directions", () => {
    const graph = buildGraph();

    const result = computeHoverNeighborhood(graph, "file-a");

    expect(result.nodeIds).toEqual(new Set(["file-a", "symbol-a1", "file-b", "file-c"]));
    expect(result.edgeIds).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("returns just the hovered node when it has no neighbors", () => {
    const graph = buildGraph();

    const result = computeHoverNeighborhood(graph, "isolated");

    expect(result.nodeIds).toEqual(new Set(["isolated"]));
    expect(result.edgeIds).toEqual(new Set());
  });

  it("returns an empty result when the hovered id is null", () => {
    const graph = buildGraph();

    const result = computeHoverNeighborhood(graph, null);

    expect(result.nodeIds).toEqual(new Set());
    expect(result.edgeIds).toEqual(new Set());
  });

  it("returns an empty result without throwing when the hovered id does not exist", () => {
    const graph = buildGraph();

    const result = computeHoverNeighborhood(graph, "does-not-exist");

    expect(result.nodeIds).toEqual(new Set());
    expect(result.edgeIds).toEqual(new Set());
  });
});
