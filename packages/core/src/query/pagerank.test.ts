import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { computeNodeImportance } from "./pagerank.js";

function starGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("center");
  for (let i = 0; i < 5; i += 1) {
    const id = `leaf-${i}`;
    graph.addNode(id);
    graph.addEdgeWithKey(`e-${i}`, id, "center");
  }
  return graph;
}

describe("computeNodeImportance", () => {
  it("scores the center of a star graph higher than the leaves", () => {
    const graph = starGraph();

    const scores = computeNodeImportance(graph);

    const centerScore = scores.get("center") ?? 0;
    const leafScore = scores.get("leaf-0") ?? 0;
    expect(centerScore).toBeGreaterThan(leafScore);
  });

  it("returns an empty map for an empty graph", () => {
    const graph = new MultiDirectedGraph();

    const scores = computeNodeImportance(graph);

    expect(scores.size).toBe(0);
  });

  it("returns a single entry of value 1 for a single-node graph", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("solo");

    const scores = computeNodeImportance(graph);

    expect(scores.size).toBe(1);
    expect(scores.get("solo")).toBe(1);
  });

  it("does not throw on disconnected components and produces a finite score for every node", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("a");
    graph.addNode("b");
    graph.addNode("c");
    graph.addNode("d");
    graph.addEdgeWithKey("e1", "a", "b");
    graph.addEdgeWithKey("e2", "c", "d");

    const scores = computeNodeImportance(graph);

    for (const id of ["a", "b", "c", "d"]) {
      const score = scores.get(id);
      expect(score).toBeDefined();
      expect(Number.isFinite(score)).toBe(true);
    }
  });
});
