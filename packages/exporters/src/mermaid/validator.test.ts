import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import { MERMAID_GRANULARITY_CAPS, validateScopedMermaidExport } from "./validator.js";

function nodes(n: number): GraphNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n-${i}`,
    type: "file" as const,
    label: `f${i}.ts`,
    filePath: `/w/f${i}.ts`,
    startLine: 1,
  }));
}

function edges(n: number): GraphEdge[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${i}`,
    source: `n-${i % Math.max(1, n - 1)}`,
    target: `n-${(i + 1) % Math.max(1, n)}`,
    kind: "CALLS" as const,
  }));
}

function subgraph(nodeCount: number, edgeCount: number): WorkspaceSubgraph {
  return { nodes: nodes(nodeCount), edges: edges(edgeCount), frameworks: [] };
}

// ---------------------------------------------------------------------------

describe("MERMAID_GRANULARITY_CAPS", () => {
  it("exposes node + edge caps for every granularity level", () => {
    expect(MERMAID_GRANULARITY_CAPS.package).toEqual({ nodes: 150, edges: 300 });
    expect(MERMAID_GRANULARITY_CAPS.file).toEqual({ nodes: 400, edges: 800 });
    expect(MERMAID_GRANULARITY_CAPS.symbol).toEqual({ nodes: 200, edges: 400 });
  });
});

describe("validateScopedMermaidExport — empty", () => {
  it("returns empty when the post-collapse subgraph has zero nodes", () => {
    const result = validateScopedMermaidExport(subgraph(0, 0), "symbol");
    expect(result.status).toBe("empty");
    if (result.status === "empty") {
      expect(result.reason).toMatch(/zero nodes/);
    }
  });
});

describe("validateScopedMermaidExport — oversized", () => {
  it("returns oversized when symbol node count exceeds the symbol cap", () => {
    const result = validateScopedMermaidExport(subgraph(201, 0), "symbol");
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.nodeCount).toBe(201);
      expect(result.cap).toEqual(MERMAID_GRANULARITY_CAPS.symbol);
      expect(result.reason).toContain("201 nodes");
      expect(result.reason).toContain("symbol cap of 200 nodes");
    }
  });

  it("returns oversized when file edge count exceeds the file cap", () => {
    const result = validateScopedMermaidExport(subgraph(10, 801), "file");
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.edgeCount).toBe(801);
      expect(result.reason).toContain("801 edges");
      expect(result.reason).toContain("file cap of 800 edges");
    }
  });

  it("uses the tightest cap for package granularity", () => {
    const result = validateScopedMermaidExport(subgraph(151, 0), "package");
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.cap).toEqual({ nodes: 150, edges: 300 });
    }
  });

  it("prefers the node-count reason over the edge-count reason when both exceed", () => {
    const result = validateScopedMermaidExport(subgraph(201, 401), "symbol");
    if (result.status === "oversized") {
      expect(result.reason).toContain("201 nodes");
      expect(result.reason).not.toContain("401 edges");
    }
  });
});

describe("validateScopedMermaidExport — ok", () => {
  it("returns ok with both counts when within the granularity cap", () => {
    const result = validateScopedMermaidExport(subgraph(50, 75), "symbol");
    expect(result).toEqual({ status: "ok", nodeCount: 50, edgeCount: 75 });
  });

  it("returns ok at the exact cap boundary (cap is inclusive)", () => {
    const result = validateScopedMermaidExport(subgraph(200, 400), "symbol");
    expect(result.status).toBe("ok");
  });
});
