import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import {
  CLASSIFIED_LAYERS,
  countArchitectureNodes,
  ENTRY_POINT_KINDS,
  GOD_CLASS_TOP_K,
  LEAST_USED_FAN_IN_THRESHOLD,
  MOST_USED_TOP_K,
  selectEntryPoints,
  selectGodClass,
  selectLeastUsed,
  selectMostUsed,
  type LensInputNode,
} from "./lenses.js";

function nodesWithImportance(scores: readonly number[]): LensInputNode[] {
  return scores.map((importance, i) => ({ id: `n${i.toString().padStart(2, "0")}`, importance }));
}

function nodesWithFanIn(values: readonly number[]): LensInputNode[] {
  return values.map((fanIn, i) => ({ id: `n${i.toString().padStart(2, "0")}`, fanIn }));
}

function makeGraphFromNodes(nodes: readonly LensInputNode[]): MultiDirectedGraph {
  const g = new MultiDirectedGraph();
  for (const n of nodes) {
    g.addNode(n.id);
  }
  return g;
}

describe("selectGodClass", () => {
  it("returns the top-K nodes ranked by importance descending", () => {
    // 15 nodes with strictly decreasing importance — top-10 are n00..n09.
    const nodes = nodesWithImportance([
      0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25,
    ]);
    const graph = makeGraphFromNodes(nodes);

    const result = selectGodClass(graph, nodes);

    expect(result.size).toBe(GOD_CLASS_TOP_K);
    for (let i = 0; i < GOD_CLASS_TOP_K; i += 1) {
      expect(result.has(`n${i.toString().padStart(2, "0")}`)).toBe(true);
    }
    expect(result.has("n10")).toBe(false);
  });

  it("breaks ties by node id ascending for deterministic output", () => {
    // All nodes share importance 0.5 — ties broken by id asc.
    const nodes = nodesWithImportance(new Array(12).fill(0.5));
    const graph = makeGraphFromNodes(nodes);

    const result = selectGodClass(graph, nodes);

    expect(result.size).toBe(GOD_CLASS_TOP_K);
    // n00..n09 must be selected; n10, n11 must not.
    expect(result.has("n00")).toBe(true);
    expect(result.has("n09")).toBe(true);
    expect(result.has("n10")).toBe(false);
    expect(result.has("n11")).toBe(false);
  });

  it("returns all eligible nodes when fewer than top-K have defined importance", () => {
    const nodes: LensInputNode[] = [
      { id: "a", importance: 0.9 },
      { id: "b", importance: 0.5 },
      { id: "c" }, // undefined → excluded
      { id: "d", importance: 0.1 },
    ];
    const graph = makeGraphFromNodes(nodes);

    const result = selectGodClass(graph, nodes);

    expect(result.size).toBe(3);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("d")).toBe(true);
    expect(result.has("c")).toBe(false);
  });
});

describe("selectMostUsed", () => {
  it("returns the top-K nodes ranked by fanIn descending", () => {
    // 30 nodes; fanIn=29..0 so top-25 are n00..n24.
    const fanInValues = Array.from({ length: 30 }, (_, i) => 29 - i);
    const nodes = nodesWithFanIn(fanInValues);
    const graph = makeGraphFromNodes(nodes);

    const result = selectMostUsed(graph, nodes);

    expect(result.size).toBe(MOST_USED_TOP_K);
    for (let i = 0; i < MOST_USED_TOP_K; i += 1) {
      expect(result.has(`n${i.toString().padStart(2, "0")}`)).toBe(true);
    }
    expect(result.has("n25")).toBe(false);
  });

  it("breaks ties by node id ascending", () => {
    const nodes = nodesWithFanIn(new Array(30).fill(5));
    const graph = makeGraphFromNodes(nodes);

    const result = selectMostUsed(graph, nodes);

    expect(result.size).toBe(MOST_USED_TOP_K);
    expect(result.has("n00")).toBe(true);
    expect(result.has("n24")).toBe(true);
    expect(result.has("n25")).toBe(false);
  });

  it("excludes nodes with undefined fanIn", () => {
    const nodes: LensInputNode[] = [
      { id: "a", fanIn: 7 },
      { id: "b", fanIn: 3 },
      { id: "c" }, // undefined
      { id: "d", fanIn: 1 },
    ];
    const graph = makeGraphFromNodes(nodes);

    const result = selectMostUsed(graph, nodes);

    expect(result.size).toBe(3);
    expect(result.has("c")).toBe(false);
  });
});

describe("selectLeastUsed", () => {
  function buildTwoComponentGraph(): {
    graph: MultiDirectedGraph;
    nodes: LensInputNode[];
  } {
    // Main component: m00..m19 connected in a chain (20 nodes, all in one component).
    // Orphan island: o0, o1, o2 connected in a small chain (3 nodes, separate component).
    const graph = new MultiDirectedGraph();
    const nodes: LensInputNode[] = [];

    for (let i = 0; i < 20; i += 1) {
      const id = `m${i.toString().padStart(2, "0")}`;
      graph.addNode(id);
      // Mix of fanIn: m00, m01 have fanIn 0 / 1 (eligible); m02..m19 have fanIn ≥ 2.
      const fanIn = i < 2 ? i : 2 + i;
      nodes.push({ id, fanIn });
      if (i > 0) {
        graph.addEdgeWithKey(`me-${i}`, `m${(i - 1).toString().padStart(2, "0")}`, id);
      }
    }

    for (let i = 0; i < 3; i += 1) {
      const id = `o${i}`;
      graph.addNode(id);
      // Orphan-island nodes also have fanIn ≤ 1.
      nodes.push({ id, fanIn: 0 });
      if (i > 0) {
        graph.addEdgeWithKey(`oe-${i}`, `o${i - 1}`, id);
      }
    }

    return { graph, nodes };
  }

  it("selects nodes with fanIn <= threshold from the largest component only", () => {
    const { graph, nodes } = buildTwoComponentGraph();

    const result = selectLeastUsed(graph, nodes);

    expect(result.has("m00")).toBe(true);
    expect(result.has("m01")).toBe(true);
    // Orphan-island nodes excluded even with fanIn=0.
    expect(result.has("o0")).toBe(false);
    expect(result.has("o1")).toBe(false);
    expect(result.has("o2")).toBe(false);
    // m02+ have fanIn > threshold, also excluded.
    expect(result.has("m02")).toBe(false);
  });

  it("excludes orphan-island nodes even when their fanIn satisfies the threshold", () => {
    const { graph, nodes } = buildTwoComponentGraph();

    const result = selectLeastUsed(graph, nodes);

    for (let i = 0; i < 3; i += 1) {
      expect(result.has(`o${i}`)).toBe(false);
    }
  });

  it("reduces to pure fanIn filtering on a single-component graph", () => {
    const graph = new MultiDirectedGraph();
    const nodes: LensInputNode[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = `n${i}`;
      graph.addNode(id);
      nodes.push({ id, fanIn: i });
      if (i > 0) {
        graph.addEdgeWithKey(`e-${i}`, `n${i - 1}`, id);
      }
    }

    const result = selectLeastUsed(graph, nodes);

    expect(result.has("n0")).toBe(true);
    expect(result.has("n1")).toBe(true);
    expect(result.has("n2")).toBe(false);
    expect(LEAST_USED_FAN_IN_THRESHOLD).toBe(1);
  });

  it("excludes nodes with undefined fanIn", () => {
    const graph = new MultiDirectedGraph();
    const nodes: LensInputNode[] = [
      { id: "a", fanIn: 0 },
      { id: "b" }, // undefined
      { id: "c", fanIn: 1 },
    ];
    for (const n of nodes) {
      graph.addNode(n.id);
    }
    graph.addEdgeWithKey("e-ab", "a", "b");
    graph.addEdgeWithKey("e-bc", "b", "c");

    const result = selectLeastUsed(graph, nodes);

    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
    expect(result.has("c")).toBe(true);
  });
});

describe("selectEntryPoints", () => {
  const emptyGraph = new MultiDirectedGraph();

  it("matches every real entry kind and excludes unclassified/absent", () => {
    const nodes: LensInputNode[] = [
      { id: "rt", entryKind: "runtime" },
      { id: "hd", entryKind: "handler" },
      { id: "ts", entryKind: "test" },
      { id: "pa", entryKind: "public-api" },
      { id: "uc", entryKind: "unclassified" },
      { id: "none" }, // entryKind absent
    ];

    const result = selectEntryPoints(emptyGraph, nodes);

    expect(result.size).toBe(4);
    expect(result.has("rt")).toBe(true);
    expect(result.has("hd")).toBe(true);
    expect(result.has("ts")).toBe(true);
    expect(result.has("pa")).toBe(true);
    expect(result.has("uc")).toBe(false);
    expect(result.has("none")).toBe(false);
  });

  it("ENTRY_POINT_KINDS excludes the unclassified sentinel", () => {
    expect(ENTRY_POINT_KINDS.has("unclassified")).toBe(false);
    expect(ENTRY_POINT_KINDS.size).toBe(4);
  });

  it("returns an empty set for empty input and a new Set each call", () => {
    const a = selectEntryPoints(emptyGraph, []);
    const b = selectEntryPoints(emptyGraph, []);
    expect(a.size).toBe(0);
    expect(a).not.toBe(b);
  });

  it("is deterministic — same input yields equal sets", () => {
    const nodes: LensInputNode[] = [
      { id: "b", entryKind: "handler" },
      { id: "a", entryKind: "runtime" },
    ];
    const first = selectEntryPoints(emptyGraph, nodes);
    const second = selectEntryPoints(emptyGraph, nodes);
    expect([...first].sort()).toEqual([...second].sort());
    expect([...first].sort()).toEqual(["a", "b"]);
  });
});

describe("architecture lens helpers", () => {
  it("CLASSIFIED_LAYERS lists the five real layers and excludes unknown", () => {
    expect(CLASSIFIED_LAYERS).toEqual([
      "presentation",
      "application",
      "domain",
      "infrastructure",
      "test",
    ]);
    expect(CLASSIFIED_LAYERS).not.toContain("unknown");
  });

  it("countArchitectureNodes counts known-layer nodes only", () => {
    const nodes: LensInputNode[] = [
      { id: "a", archLayer: "presentation" },
      { id: "b", archLayer: "domain" },
      { id: "c", archLayer: "unknown" }, // excluded
      { id: "d" }, // absent — excluded
    ];
    expect(countArchitectureNodes(nodes)).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(countArchitectureNodes([])).toBe(0);
  });
});
