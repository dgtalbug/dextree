import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { detectCommunities, EMPTY_PARTITION } from "./graphCommunities.js";

/** Two dense triangles joined by a single bridge edge → two communities. */
function twoClusterGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  for (const id of ["a1", "a2", "a3", "b1", "b2", "b3"]) {
    graph.addNode(id);
  }
  // Cluster A — fully connected triangle.
  graph.addEdge("a1", "a2");
  graph.addEdge("a2", "a3");
  graph.addEdge("a3", "a1");
  // Cluster B — fully connected triangle.
  graph.addEdge("b1", "b2");
  graph.addEdge("b2", "b3");
  graph.addEdge("b3", "b1");
  // One thin bridge between the clusters.
  graph.addEdge("a1", "b1");
  return graph;
}

describe("detectCommunities", () => {
  it("returns an empty partition for an empty graph", () => {
    expect(detectCommunities(new MultiDirectedGraph())).toBe(EMPTY_PARTITION);
  });

  it("assigns every node a community", () => {
    const graph = twoClusterGraph();
    const { byNode } = detectCommunities(graph);
    for (const id of graph.nodes()) {
      expect(byNode.has(id)).toBe(true);
    }
  });

  it("separates two dense clusters into different communities", () => {
    const { byNode, count } = detectCommunities(twoClusterGraph());
    // The two triangles should land in distinct communities.
    expect(byNode.get("a1")).toBe(byNode.get("a2"));
    expect(byNode.get("a2")).toBe(byNode.get("a3"));
    expect(byNode.get("b1")).toBe(byNode.get("b2"));
    expect(byNode.get("a1")).not.toBe(byNode.get("b1"));
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic: the same graph yields the same partition run-to-run", () => {
    const first = detectCommunities(twoClusterGraph());
    const second = detectCommunities(twoClusterGraph());
    expect([...first.byNode.entries()].sort()).toEqual([...second.byNode.entries()].sort());
    expect(first.count).toBe(second.count);
  });

  it("handles a disconnected node (its own community, no throw)", () => {
    const graph = twoClusterGraph();
    graph.addNode("lonely");
    const { byNode } = detectCommunities(graph);
    expect(byNode.has("lonely")).toBe(true);
  });

  it("handles a single isolated node", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("solo");
    const { byNode, count } = detectCommunities(graph);
    expect(byNode.get("solo")).toBe(0);
    expect(count).toBe(1);
  });
});
