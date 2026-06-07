import type { GraphEdge, GraphNode } from "@dextree/core";
import { describe, expect, it } from "vitest";

import type { SelectionTraversal, ThemeColors } from "../components/graphViewTypes.js";
import { buildFocusedGraphModel, FOCUSED_VIEW_MAX_NODES } from "./focusedGraphModel.js";
import { computeFocusedLayout, FOCUSED_RING_SPACING } from "./focusedLayout.js";
import { focusedEdgeStyle } from "./edgeStyles.js";

const colors: ThemeColors = {
  backgroundColor: "#000000",
  labelColor: "#ffffff",
  disabledColor: "#888888",
  fileNodeColor: "#1188ff",
  symbolKindColors: {
    default: "#cccccc",
    function: "#dcaa00",
    class: "#33cc88",
    interface: "#8888ff",
    enum: "#cc8800",
    variable: "#aaaaaa",
    type: "#8888ff",
    method: "#dcaa00",
  },
  definesEdgeColor: "#1166cc",
  importsEdgeColor: "#22aa44",
  callsEdgeColor: "#ee8822",
  inheritsEdgeColor: "#aa44cc",
  instantiatesEdgeColor: "#cc4422",
  tracePathEdgeColor: "#dcdcaa",
  callerEdgeColor: "#22aa44",
  calleeEdgeColor: "#ee8822",
  entryBorderColor: "#d4af37",
};

function sym(id: string, importance?: number, isCore?: boolean): GraphNode {
  return {
    id,
    type: "symbol",
    label: id,
    filePath: `src/${id}.ts`,
    startLine: 1,
    symbolKind: "function",
    ...(importance === undefined ? {} : { importance }),
    ...(isCore === undefined ? {} : { isCore }),
  };
}

function edge(id: string, source: string, target: string, kind: GraphEdge["kind"]): GraphEdge {
  return { id, source, target, kind };
}

/** focus → a,b (ring1); a → c (ring2). */
function traversal(over: Partial<SelectionTraversal> = {}): SelectionTraversal {
  return {
    selectedNodeId: "focus",
    nodeIds: new Set(["focus", "a", "b", "c"]),
    edgeIds: new Set(["e1", "e2", "e3"]),
    orderedEdgeIds: ["e1", "e2", "e3"],
    hopLayers: [["e1", "e2"], ["e3"]],
    nodeLayers: [["focus"], ["a", "b"], ["c"]],
    maxDepth: 2,
    ...over,
  };
}

describe("buildFocusedGraphModel", () => {
  const nodes = [sym("focus", 5), sym("a", 3), sym("b", 2), sym("c", 1)];
  const edges = [
    edge("e1", "focus", "a", "CALLS"), // outbound (callee)
    edge("e2", "b", "focus", "CALLS"), // inbound (caller)
    edge("e3", "a", "c", "IMPORTS"),
  ];

  it("includes the focus node and its neighbourhood with ring indices", () => {
    const model = buildFocusedGraphModel(nodes, edges, traversal());
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    expect(byId.get("focus")?.isFocus).toBe(true);
    expect(byId.get("focus")?.ring).toBe(0);
    expect(byId.get("a")?.ring).toBe(1);
    expect(byId.get("c")?.ring).toBe(2);
    expect(model.truncatedCount).toBe(0);
  });

  it("classifies edge direction relative to the focus node", () => {
    const model = buildFocusedGraphModel(nodes, edges, traversal());
    const byId = new Map(model.edges.map((e) => [e.id, e]));
    expect(byId.get("e1")?.direction).toBe("outbound"); // focus → a
    expect(byId.get("e2")?.direction).toBe("inbound"); // b → focus
    expect(byId.get("e3")?.direction).toBe("other"); // a → c
  });

  it("caps the neighbourhood to the most important nodes and reports truncation", () => {
    const many = [sym("focus", 100), ...Array.from({ length: 10 }, (_, i) => sym(`n${i}`, i))];
    const t = traversal({
      selectedNodeId: "focus",
      nodeIds: new Set(many.map((n) => n.id)),
      edgeIds: new Set(),
      orderedEdgeIds: [],
      hopLayers: [],
      nodeLayers: [["focus"], many.slice(1).map((n) => n.id)],
    });
    const model = buildFocusedGraphModel(many, [], t, 4); // focus + top 3
    expect(model.nodes).toHaveLength(4);
    expect(model.nodes.some((n) => n.isFocus)).toBe(true);
    // Highest-importance others kept (n9, n8, n7), lowest dropped.
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["focus", "n7", "n8", "n9"]);
    expect(model.truncatedCount).toBe(7); // 10 others − 3 kept
  });

  it("drops edges whose endpoint was truncated", () => {
    const many = [sym("focus", 100), ...Array.from({ length: 10 }, (_, i) => sym(`n${i}`, i))];
    const droppedEdge = edge("ed", "focus", "n0", "CALLS"); // n0 is lowest importance → dropped
    const t = traversal({
      nodeIds: new Set(many.map((n) => n.id)),
      edgeIds: new Set(["ed"]),
      nodeLayers: [["focus"], many.slice(1).map((n) => n.id)],
    });
    const model = buildFocusedGraphModel(many, [droppedEdge], t, 4);
    expect(model.edges).toHaveLength(0);
  });

  it("default cap is the documented constant", () => {
    expect(FOCUSED_VIEW_MAX_NODES).toBeGreaterThan(0);
  });
});

describe("computeFocusedLayout", () => {
  it("places the focus node at the origin and rings at increasing radius", () => {
    const model = buildFocusedGraphModel(
      [sym("focus", 5), sym("a", 3), sym("b", 2), sym("c", 1)],
      [],
      traversal({ edgeIds: new Set() }),
    );
    const pos = computeFocusedLayout(model.nodes);
    expect(pos.get("focus")).toEqual({ x: 0, y: 0 });

    const radius = (id: string) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y);
    expect(radius("a")).toBeCloseTo(FOCUSED_RING_SPACING, 5);
    expect(radius("c")).toBeCloseTo(2 * FOCUSED_RING_SPACING, 5);
  });

  it("spreads same-ring nodes to distinct positions", () => {
    const model = buildFocusedGraphModel(
      [sym("focus", 5), sym("a", 3), sym("b", 2)],
      [],
      traversal({ nodeIds: new Set(["focus", "a", "b"]), nodeLayers: [["focus"], ["a", "b"]] }),
    );
    const pos = computeFocusedLayout(model.nodes);
    expect(pos.get("a")).not.toEqual(pos.get("b"));
  });
});

describe("focusedEdgeStyle", () => {
  it("routes edges (smoothstep) with an arrowhead", () => {
    const style = focusedEdgeStyle(
      { id: "e", source: "x", target: "y", kind: "IMPORTS", direction: "other" },
      colors,
    );
    expect(style.type).toBe("smoothstep");
    expect(style.markerEnd).toBe(true);
    expect(style.color).toBe(colors.importsEdgeColor);
  });

  it("colours CALLS by direction and emphasises focus-adjacent edges", () => {
    const inbound = focusedEdgeStyle(
      { id: "i", source: "b", target: "focus", kind: "CALLS", direction: "inbound" },
      colors,
    );
    const outbound = focusedEdgeStyle(
      { id: "o", source: "focus", target: "a", kind: "CALLS", direction: "outbound" },
      colors,
    );
    const other = focusedEdgeStyle(
      { id: "x", source: "a", target: "c", kind: "CALLS", direction: "other" },
      colors,
    );
    expect(inbound.color).toBe(colors.callerEdgeColor);
    expect(outbound.color).toBe(colors.calleeEdgeColor);
    expect(inbound.strokeWidth).toBeGreaterThan(other.strokeWidth);
  });
});
