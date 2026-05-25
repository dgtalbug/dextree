import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import { applyMermaidGranularity } from "./granularity.js";

// ---------------------------------------------------------------------------
// Fixtures: a small monorepo-shaped graph with two packages, two files
// each, and a few symbols + cross-file CALLS edges.
// ---------------------------------------------------------------------------

const FILE_A1: GraphNode = {
  id: "f-a1",
  type: "file",
  label: "a1.ts",
  filePath: "/repo/packages/alpha/src/a1.ts",
  startLine: 1,
};
const FILE_A2: GraphNode = {
  id: "f-a2",
  type: "file",
  label: "a2.ts",
  filePath: "/repo/packages/alpha/src/a2.ts",
  startLine: 1,
};
const FILE_B1: GraphNode = {
  id: "f-b1",
  type: "file",
  label: "b1.ts",
  filePath: "/repo/packages/beta/src/b1.ts",
  startLine: 1,
};
const ORPHAN_FILE: GraphNode = {
  id: "f-orphan",
  type: "file",
  label: "orphan.ts",
  filePath: "/repo/packages/alpha/src/orphan.ts",
  startLine: 1,
};

const SYM_A1A: GraphNode = {
  id: "s-a1a",
  type: "symbol",
  label: "foo",
  filePath: "/repo/packages/alpha/src/a1.ts",
  startLine: 3,
  symbolKind: "function",
};
const SYM_A1B: GraphNode = {
  id: "s-a1b",
  type: "symbol",
  label: "bar",
  filePath: "/repo/packages/alpha/src/a1.ts",
  startLine: 7,
  symbolKind: "function",
};
const SYM_A2: GraphNode = {
  id: "s-a2",
  type: "symbol",
  label: "baz",
  filePath: "/repo/packages/alpha/src/a2.ts",
  startLine: 3,
  symbolKind: "function",
};
const SYM_B1: GraphNode = {
  id: "s-b1",
  type: "symbol",
  label: "qux",
  filePath: "/repo/packages/beta/src/b1.ts",
  startLine: 3,
  symbolKind: "function",
};

const DEFINES_A1A: GraphEdge = { id: "e1", source: "f-a1", target: "s-a1a", kind: "DEFINES" };
const DEFINES_A1B: GraphEdge = { id: "e2", source: "f-a1", target: "s-a1b", kind: "DEFINES" };
const DEFINES_A2: GraphEdge = { id: "e3", source: "f-a2", target: "s-a2", kind: "DEFINES" };
const DEFINES_B1: GraphEdge = { id: "e4", source: "f-b1", target: "s-b1", kind: "DEFINES" };
// intra-file call: stays inside a1.ts
const CALLS_INTRA: GraphEdge = { id: "e5", source: "s-a1a", target: "s-a1b", kind: "CALLS" };
// cross-file calls: a1 → a2 (same package) and a1 → b1 (across packages)
const CALLS_A_TO_A: GraphEdge = { id: "e6", source: "s-a1a", target: "s-a2", kind: "CALLS" };
const CALLS_A_TO_B: GraphEdge = { id: "e7", source: "s-a1b", target: "s-b1", kind: "CALLS" };
// duplicate cross-file calls (different symbols, same file pair) to exercise dedup
const CALLS_A_TO_B_DUP: GraphEdge = {
  id: "e8",
  source: "s-a1a",
  target: "s-b1",
  kind: "CALLS",
};

const MONOREPO: WorkspaceSubgraph = {
  nodes: [FILE_A1, FILE_A2, FILE_B1, ORPHAN_FILE, SYM_A1A, SYM_A1B, SYM_A2, SYM_B1],
  edges: [
    DEFINES_A1A,
    DEFINES_A1B,
    DEFINES_A2,
    DEFINES_B1,
    CALLS_INTRA,
    CALLS_A_TO_A,
    CALLS_A_TO_B,
    CALLS_A_TO_B_DUP,
  ],
  frameworks: [],
};

// ---------------------------------------------------------------------------
// symbol — identity pass-through
// ---------------------------------------------------------------------------

describe("applyMermaidGranularity — symbol", () => {
  it("returns the input subgraph reference unchanged", () => {
    const result = applyMermaidGranularity(MONOREPO, "symbol");
    expect(result).toBe(MONOREPO);
  });
});

// ---------------------------------------------------------------------------
// file — collapse symbols into parent files
// ---------------------------------------------------------------------------

describe("applyMermaidGranularity — file", () => {
  it("removes every symbol node and keeps every file node (orphan files included)", () => {
    const result = applyMermaidGranularity(MONOREPO, "file");
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["f-a1", "f-a2", "f-b1", "f-orphan"]);
    expect(result.nodes.every((n) => n.type === "file")).toBe(true);
  });

  it("drops intra-file edges introduced by the collapse (DEFINES becomes self-edge)", () => {
    const result = applyMermaidGranularity(MONOREPO, "file");
    // DEFINES (file → symbol) collapses to file → file === self. Intra-file
    // CALLS (s-a1a → s-a1b) also collapses to f-a1 → f-a1 === self.
    const selfEdges = result.edges.filter((e) => e.source === e.target);
    expect(selfEdges).toEqual([]);
  });

  it("folds cross-file symbol edges into file→file edges and deduplicates", () => {
    const result = applyMermaidGranularity(MONOREPO, "file");
    // CALLS_A_TO_A: s-a1a → s-a2 collapses to f-a1 → f-a2.
    // CALLS_A_TO_B + CALLS_A_TO_B_DUP both collapse to f-a1 → f-b1; dedup
    // leaves a single edge.
    const callsEdges = result.edges
      .filter((e) => e.kind === "CALLS")
      .map((e) => `${e.source}->${e.target}`)
      .sort();
    expect(callsEdges).toEqual(["f-a1->f-a2", "f-a1->f-b1"]);
  });

  it("returns a new object (never mutates the input)", () => {
    const result = applyMermaidGranularity(MONOREPO, "file");
    expect(result).not.toBe(MONOREPO);
    expect(result.nodes).not.toBe(MONOREPO.nodes);
    expect(result.edges).not.toBe(MONOREPO.edges);
  });

  it("preserves the input frameworks list reference", () => {
    const result = applyMermaidGranularity(MONOREPO, "file");
    expect(result.frameworks).toBe(MONOREPO.frameworks);
  });
});

// ---------------------------------------------------------------------------
// package — collapse files into packages/<name>
// ---------------------------------------------------------------------------

describe("applyMermaidGranularity — package", () => {
  it("produces exactly one node per detected package", () => {
    const result = applyMermaidGranularity(MONOREPO, "package");
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["pkg:alpha", "pkg:beta"]);
    expect(result.nodes.every((n) => n.type === "file")).toBe(true);
  });

  it("labels the synthetic package nodes with the package name", () => {
    const result = applyMermaidGranularity(MONOREPO, "package");
    const labels = result.nodes.map((n) => n.label).sort();
    expect(labels).toEqual(["alpha", "beta"]);
  });

  it("folds all cross-package edges into a single edge per (source, target, kind)", () => {
    const result = applyMermaidGranularity(MONOREPO, "package");
    // Only edges that crossed packages survive (DEFINES and intra-package
    // CALLS become self-edges on pkg:alpha and are dropped).
    const crossEdges = result.edges.map((e) => `${e.source}->${e.target}:${e.kind}`).sort();
    expect(crossEdges).toEqual(["pkg:alpha->pkg:beta:CALLS"]);
  });

  it("uses the immediate parent folder as the package name when no /packages/<name>/ segment is present", () => {
    const flat: WorkspaceSubgraph = {
      nodes: [
        {
          id: "f-flat",
          type: "file",
          label: "foo.ts",
          filePath: "/workspace/src/foo.ts",
          startLine: 1,
        },
      ],
      edges: [],
      frameworks: [],
    };
    const result = applyMermaidGranularity(flat, "package");
    expect(result.nodes.map((n) => n.label)).toEqual(["src"]);
  });
});
