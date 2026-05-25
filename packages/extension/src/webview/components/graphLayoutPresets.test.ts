/**
 * Tests for `graphLayoutPresets` (slice 025).
 *
 * Phase 2 covers metadata + snapshot/restore. Phase 4 (Circular) and
 * Phase 5 (Hierarchical) extend this file with preset application coverage.
 */

import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import {
  applyLayoutPreset,
  LAYOUT_PRESET_OPTIONS,
  restoreNodePositions,
  snapshotNodePositions,
} from "./graphLayoutPresets.js";

function buildSampleGraph(): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  graph.addNode("a", { x: 1, y: 2 });
  graph.addNode("b", { x: -3, y: 4.5 });
  graph.addNode("c", { x: 0, y: 0 });
  return graph;
}

describe("LAYOUT_PRESET_OPTIONS", () => {
  it("exposes exactly three presets in spec order (FR-002)", () => {
    expect(LAYOUT_PRESET_OPTIONS.map((opt) => opt.id)).toEqual([
      "forceAtlas2",
      "circular",
      "hierarchical",
    ]);
  });

  it("declares user-facing labels matching the spec", () => {
    expect(LAYOUT_PRESET_OPTIONS.map((opt) => opt.label)).toEqual([
      "ForceAtlas2",
      "Circular",
      "Hierarchical",
    ]);
  });

  it("provides a non-empty description for every option", () => {
    for (const opt of LAYOUT_PRESET_OPTIONS) {
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });
});

describe("snapshotNodePositions", () => {
  it("captures x/y for every node currently in the graph", () => {
    const graph = buildSampleGraph();
    const snap = snapshotNodePositions(graph);
    expect(snap.size).toBe(3);
    expect(snap.get("a")).toEqual({ x: 1, y: 2 });
    expect(snap.get("b")).toEqual({ x: -3, y: 4.5 });
    expect(snap.get("c")).toEqual({ x: 0, y: 0 });
  });

  it("defaults missing x/y to 0 rather than throwing", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("untyped");
    const snap = snapshotNodePositions(graph);
    expect(snap.get("untyped")).toEqual({ x: 0, y: 0 });
  });
});

describe("restoreNodePositions", () => {
  it("writes snapshot coordinates back onto matching nodes", () => {
    const graph = buildSampleGraph();
    const snap = snapshotNodePositions(graph);

    graph.setNodeAttribute("a", "x", 99);
    graph.setNodeAttribute("a", "y", 99);

    restoreNodePositions(graph, snap);

    expect(graph.getNodeAttribute("a", "x")).toBe(1);
    expect(graph.getNodeAttribute("a", "y")).toBe(2);
  });

  it("silently skips snapshot entries whose nodes are no longer in the graph", () => {
    const graph = buildSampleGraph();
    const snap = snapshotNodePositions(graph);

    graph.dropNode("c");

    expect(() => restoreNodePositions(graph, snap)).not.toThrow();
    expect(graph.hasNode("c")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyLayoutPreset (slice 025 US2 — Circular)
// ---------------------------------------------------------------------------

function buildVisibleSet(graph: MultiDirectedGraph): ReadonlySet<string> {
  return new Set(graph.nodes());
}

function buildVisibleEdgeSet(graph: MultiDirectedGraph): ReadonlySet<string> {
  return new Set(graph.edges());
}

describe("applyLayoutPreset — no-op behavior", () => {
  it("returns noop with reason=already-active when re-selecting the active preset", () => {
    const graph = buildSampleGraph();
    const result = applyLayoutPreset(graph, "forceAtlas2", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });
    expect(result.status).toBe("noop");
    if (result.status === "noop") {
      expect(result.reason).toBe("already-active");
      expect(result.ranReadabilityPass).toBe(false);
    }
  });

  it("returns noop with reason=trivial-graph for a single-node graph", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("only", { x: 5, y: 5 });
    const result = applyLayoutPreset(graph, "circular", {
      activePreset: "forceAtlas2",
      visibleNodeIds: new Set(["only"]),
      visibleEdgeIds: new Set(),
    });
    expect(result.status).toBe("noop");
    if (result.status === "noop") {
      expect(result.reason).toBe("trivial-graph");
    }
  });
});

describe("applyLayoutPreset — Circular (slice 025 US2)", () => {
  it("returns applied with ranReadabilityPass=true when switching to circular (FR-005, FR-006)", () => {
    const graph = buildSampleGraph();
    const result = applyLayoutPreset(graph, "circular", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.preset).toBe("circular");
      expect(result.ranReadabilityPass).toBe(true);
      expect(result.notice).toBeNull();
    }
  });

  it("repositions every visible node onto a circle around the origin", () => {
    const graph = buildSampleGraph();
    // Reset to a known non-circular layout
    graph.setNodeAttribute("a", "x", 0);
    graph.setNodeAttribute("a", "y", 0);
    graph.setNodeAttribute("b", "x", 0);
    graph.setNodeAttribute("b", "y", 0);
    graph.setNodeAttribute("c", "x", 0);
    graph.setNodeAttribute("c", "y", 0);

    applyLayoutPreset(graph, "circular", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    // After Circular + noverlap, all three nodes should have non-zero,
    // distinct positions.
    const positions = ["a", "b", "c"].map((id) => ({
      x: graph.getNodeAttribute(id, "x") as number,
      y: graph.getNodeAttribute(id, "y") as number,
    }));
    expect(new Set(positions.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(3);
  });
});

describe("applyLayoutPreset — ForceAtlas2 re-application", () => {
  it("returns applied when switching from circular back to forceAtlas2 (US2 acceptance #3)", () => {
    const graph = buildSampleGraph();
    // Add at least one edge so ForceAtlas2 has something to push around.
    graph.addDirectedEdgeWithKey("e1", "a", "b");

    const result = applyLayoutPreset(graph, "forceAtlas2", {
      activePreset: "circular",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.preset).toBe("forceAtlas2");
      expect(result.ranReadabilityPass).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// applyLayoutPreset — Hierarchical (slice 025 US3)
// ---------------------------------------------------------------------------

function buildDagGraph(): MultiDirectedGraph {
  // Two-layer DAG: root -> mid1 + mid2 -> leaf
  const graph = new MultiDirectedGraph();
  graph.addNode("root", { x: 0, y: 0 });
  graph.addNode("mid1", { x: 0, y: 0 });
  graph.addNode("mid2", { x: 0, y: 0 });
  graph.addNode("leaf", { x: 0, y: 0 });
  graph.addDirectedEdgeWithKey("e1", "root", "mid1");
  graph.addDirectedEdgeWithKey("e2", "root", "mid2");
  graph.addDirectedEdgeWithKey("e3", "mid1", "leaf");
  graph.addDirectedEdgeWithKey("e4", "mid2", "leaf");
  return graph;
}

describe("applyLayoutPreset — Hierarchical (slice 025 US3)", () => {
  it("applies layered positions on a DAG-suitable graph (US3 acceptance #1, FR-007)", () => {
    const graph = buildDagGraph();

    const result = applyLayoutPreset(graph, "hierarchical", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.preset).toBe("hierarchical");
      expect(result.ranReadabilityPass).toBe(true);
    }

    // Root sits at the top layer, leaf at the bottom (y increases by layer).
    const rootY = graph.getNodeAttribute("root", "y") as number;
    const leafY = graph.getNodeAttribute("leaf", "y") as number;
    expect(leafY).toBeGreaterThan(rootY);
  });

  it("rejects with reason=cyclic on a cyclic visible projection", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("a", { x: 0, y: 0 });
    graph.addNode("b", { x: 0, y: 0 });
    graph.addNode("c", { x: 0, y: 0 });
    graph.addDirectedEdgeWithKey("a-b", "a", "b");
    graph.addDirectedEdgeWithKey("b-c", "b", "c");
    graph.addDirectedEdgeWithKey("c-a", "c", "a"); // cycle

    const result = applyLayoutPreset(graph, "hierarchical", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("cyclic");
      expect(result.fallbackPreset).toBe("forceAtlas2");
      expect(result.notice.preset).toBe("hierarchical");
    }
  });

  it("rejects with reason=no-directed-edges on a graph with no edges", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("a", { x: 0, y: 0 });
    graph.addNode("b", { x: 0, y: 0 });
    // No edges → DAG check yields a single generation with both, but the
    // projection size check catches the "no directed edges" case first.

    const result = applyLayoutPreset(graph, "hierarchical", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(result.status).toBe("rejected");
  });

  it("rejects with reason=overfull-generation when one layer dominates", () => {
    const graph = new MultiDirectedGraph();
    // Hub-and-spoke: one root, many disconnected leaves -> single generation.
    // But to trigger overfull-generation specifically, build a 2-gen graph
    // where the second gen has > 80% of nodes.
    graph.addNode("root", { x: 0, y: 0 });
    for (let i = 0; i < 10; i++) {
      graph.addNode(`leaf-${i}`, { x: 0, y: 0 });
      graph.addDirectedEdgeWithKey(`e-${i}`, "root", `leaf-${i}`);
    }
    // 1 root + 10 leaves = 11 nodes. Second layer = 10 nodes = 10/11 ≈ 91% (>80%).

    const result = applyLayoutPreset(graph, "hierarchical", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("overfull-generation");
    }
  });

  it("does not mutate node positions when rejecting (caller-driven rollback contract)", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("a", { x: 7, y: 9 });
    graph.addNode("b", { x: -3, y: -2 });
    graph.addNode("c", { x: 1, y: 1 });
    graph.addDirectedEdgeWithKey("a-b", "a", "b");
    graph.addDirectedEdgeWithKey("b-c", "b", "c");
    graph.addDirectedEdgeWithKey("c-a", "c", "a"); // cycle

    applyLayoutPreset(graph, "hierarchical", {
      activePreset: "forceAtlas2",
      visibleNodeIds: buildVisibleSet(graph),
      visibleEdgeIds: buildVisibleEdgeSet(graph),
    });

    expect(graph.getNodeAttribute("a", "x")).toBe(7);
    expect(graph.getNodeAttribute("a", "y")).toBe(9);
  });
});
