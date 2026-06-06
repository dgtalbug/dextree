import type { GraphEdge, GraphNode } from "@dextree/core";
import { describe, expect, it } from "vitest";

import type { ThemeColors } from "./graphViewTypes.js";
import {
  buildGraph,
  computeSizeBounds,
  edgeColor,
  edgeSize,
  mixWithBackground,
  sizeForNode,
  symbolColor,
  toFadedColor,
} from "./graphBuild.js";

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

function fileNode(id: string, filePath: string, importance?: number): GraphNode {
  return {
    id,
    type: "file",
    label: id,
    filePath,
    startLine: 1,
    ...(importance ? { importance } : {}),
  };
}

function symbolNode(
  id: string,
  filePath: string,
  symbolKind: GraphNode["symbolKind"],
  importance?: number,
): GraphNode {
  return {
    id,
    type: "symbol",
    label: id,
    filePath,
    startLine: 1,
    symbolKind,
    ...(importance ? { importance } : {}),
  };
}

describe("toFadedColor", () => {
  it("fades an rgb() colour to the fade alpha", () => {
    expect(toFadedColor("rgb(255, 128, 64)", "#000000")).toBe("rgba(255, 128, 64, 0.06)");
  });

  it("fades a #rrggbb colour to the fade alpha", () => {
    expect(toFadedColor("#ff8040", "#000000")).toBe("rgba(255, 128, 64, 0.06)");
  });

  it("fades the fallback colour when the input is not a usable string", () => {
    // A non-string input falls back to the fallback colour, which is itself
    // faded when it is a parseable hex/rgb value.
    expect(toFadedColor(42, "#123456")).toBe("rgba(18, 52, 86, 0.06)");
  });

  it("returns the fallback verbatim when neither input is parseable", () => {
    expect(toFadedColor(42, "transparent")).toBe("transparent");
  });
});

describe("edgeColor / edgeSize", () => {
  it("maps each edge kind to its themed colour", () => {
    expect(edgeColor("CALLS", colors)).toBe(colors.callsEdgeColor);
    expect(edgeColor("IMPORTS", colors)).toBe(colors.importsEdgeColor);
    expect(edgeColor("INHERITS", colors)).toBe(colors.inheritsEdgeColor);
  });

  it("gives DEFINES the boldest width and IMPORTS the thinnest", () => {
    expect(edgeSize("DEFINES")).toBeGreaterThan(edgeSize("CALLS"));
    expect(edgeSize("IMPORTS")).toBeLessThanOrEqual(edgeSize("CALLS"));
  });
});

describe("symbolColor", () => {
  it("uses the file colour for file nodes", () => {
    expect(symbolColor(fileNode("f", "a.ts"), colors)).toBe(colors.fileNodeColor);
  });

  it("falls back to the default colour for an unknown symbol kind", () => {
    expect(symbolColor(symbolNode("s", "a.ts", undefined), colors)).toBe(
      colors.symbolKindColors.default,
    );
  });
});

describe("computeSizeBounds / sizeForNode", () => {
  it("finds the min/max of finite importances", () => {
    const bounds = computeSizeBounds([
      symbolNode("a", "x.ts", "function", 1),
      symbolNode("b", "x.ts", "function", 9),
      symbolNode("c", "x.ts", "function"), // no importance — ignored
    ]);
    expect(bounds).toEqual({ min: 1, max: 9 });
  });

  it("returns the base size when importance is absent or bounds are degenerate", () => {
    const node = symbolNode("a", "x.ts", "function");
    const size = sizeForNode(node, { min: 1, max: 1 });
    // Symbol base size.
    expect(size).toBe(7);
  });

  it("scales higher importance to a larger size", () => {
    const low = sizeForNode(symbolNode("a", "x.ts", "function", 1), { min: 1, max: 10 });
    const high = sizeForNode(symbolNode("b", "x.ts", "function", 10), { min: 1, max: 10 });
    expect(high).toBeGreaterThan(low);
  });
});

describe("mixWithBackground", () => {
  it("blends a colour toward the background by the given ratio", () => {
    // 50% of white over black = mid grey.
    expect(mixWithBackground("#ffffff", "#000000", 0.5)).toBe("#808080");
  });

  it("returns the original colour when either input is not hex", () => {
    expect(mixWithBackground("rgb(1,2,3)", "#000000", 0.5)).toBe("rgb(1,2,3)");
  });
});

describe("buildGraph", () => {
  it("builds nodes and edges, skipping edges with missing endpoints", () => {
    const nodes = [fileNode("f1", "a.ts"), symbolNode("s1", "a.ts", "function")];
    const edges: GraphEdge[] = [
      { id: "e1", source: "f1", target: "s1", kind: "DEFINES" },
      { id: "e2", source: "f1", target: "ghost", kind: "CALLS" }, // ghost target → skipped
    ];

    const graph = buildGraph(nodes, edges, colors);

    expect(graph.order).toBe(2);
    expect(graph.hasEdge("e1")).toBe(true);
    expect(graph.size).toBe(1);
  });

  it("dedupes nodes with the same id and skips blank ids", () => {
    const nodes = [
      fileNode("f1", "a.ts"),
      fileNode("f1", "a.ts"), // duplicate id
      fileNode("  ", "b.ts"), // blank id
    ];

    const graph = buildGraph(nodes, [], colors);

    expect(graph.order).toBe(1);
  });

  it("stamps importance-scaled size and base colour onto nodes", () => {
    const graph = buildGraph([symbolNode("s1", "a.ts", "function", 5)], [], colors);
    const attrs = graph.getNodeAttributes("s1");
    expect(attrs.baseColor).toBe(colors.symbolKindColors.function);
    expect(typeof attrs.size).toBe("number");
  });
});
