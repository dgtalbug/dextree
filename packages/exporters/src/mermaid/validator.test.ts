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
  it("exposes hard + soft node/edge caps for every granularity level", () => {
    expect(MERMAID_GRANULARITY_CAPS.package).toEqual({
      nodes: 150,
      edges: 300,
      soft: { nodes: 75, edges: 150 },
    });
    expect(MERMAID_GRANULARITY_CAPS.file).toEqual({
      nodes: 400,
      edges: 800,
      soft: { nodes: 200, edges: 400 },
    });
    expect(MERMAID_GRANULARITY_CAPS.symbol).toEqual({
      nodes: 200,
      edges: 400,
      soft: { nodes: 100, edges: 200 },
    });
  });

  it("keeps every soft cap below its hard cap", () => {
    for (const cap of Object.values(MERMAID_GRANULARITY_CAPS)) {
      expect(cap.soft.nodes).toBeLessThan(cap.nodes);
      expect(cap.soft.edges).toBeLessThan(cap.edges);
    }
  });
});

describe("validateScopedMermaidExport — soft cap (warning tier)", () => {
  it("returns ok at or below the symbol soft cap (100 nodes)", () => {
    const result = validateScopedMermaidExport(subgraph(100, 0), "symbol");
    expect(result.status).toBe("ok");
  });

  it("returns warning (not blocking) between the symbol soft and hard caps", () => {
    const result = validateScopedMermaidExport(subgraph(150, 0), "symbol");
    expect(result.status).toBe("warning");
    if (result.status === "warning") {
      expect(result.nodeCount).toBe(150);
      expect(result.reason).toMatch(/soft cap/i);
    }
  });

  it("returns warning at exactly soft+1 nodes", () => {
    expect(validateScopedMermaidExport(subgraph(101, 0), "symbol").status).toBe("warning");
  });

  it("returns oversized (blocking) above the symbol hard cap (200 nodes)", () => {
    expect(validateScopedMermaidExport(subgraph(201, 0), "symbol").status).toBe("oversized");
  });

  it("warns on edges above the soft edge cap even when nodes are fine", () => {
    // symbol soft edges = 200, hard edges = 400.
    const result = validateScopedMermaidExport(subgraph(10, 250), "symbol");
    expect(result.status).toBe("warning");
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
      expect(result.cap).toEqual({ nodes: 150, edges: 300, soft: { nodes: 75, edges: 150 } });
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

  it("does not block at the exact hard-cap boundary (cap is inclusive — warns, not oversized)", () => {
    // 200 nodes / 400 edges == the symbol hard cap: allowed (not oversized), but
    // above the soft cap so it surfaces a warning rather than a clean ok.
    const result = validateScopedMermaidExport(subgraph(200, 400), "symbol");
    expect(result.status).toBe("warning");
  });

  it("returns ok at exactly the soft-cap boundary (soft is inclusive)", () => {
    // symbol soft cap = 100 nodes / 200 edges → still a clean ok.
    const result = validateScopedMermaidExport(subgraph(100, 200), "symbol");
    expect(result.status).toBe("ok");
  });
});
