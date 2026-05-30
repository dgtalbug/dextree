import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";
import { serializeToMermaid } from "./serializer.js";
import { serializeToScopedMermaid } from "./scopedSerializer.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFileNode(id: string, label: string): GraphNode {
  return { id, type: "file", label, filePath: `/workspace/${label}`, startLine: 0 };
}

function makeSymbolNode(
  id: string,
  label: string,
  symbolKind: GraphNode["symbolKind"] = "function",
): GraphNode {
  return { id, type: "symbol", label, filePath: `/workspace/a.ts`, startLine: 1, symbolKind };
}

function makeEdge(id: string, source: string, target: string, kind: GraphEdge["kind"]): GraphEdge {
  return { id, source, target, kind };
}

const FILE_A = makeFileNode("aaaa-1111-aaaa-1111-aaaaaaaaaaaa", "src/a.ts");
const FILE_B = makeFileNode("bbbb-2222-bbbb-2222-bbbbbbbbbbbb", "src/b.ts");
const FUNC_FOO = makeSymbolNode("cccc-3333-cccc-3333-cccccccccccc", "foo", "function");
const CLASS_BAR = makeSymbolNode("dddd-4444-dddd-4444-dddddddddddd", "Bar", "class");

const EDGE_DEFINES = makeEdge("e001", FILE_A.id, FUNC_FOO.id, "DEFINES");
const EDGE_IMPORTS = makeEdge("e002", FILE_B.id, FILE_A.id, "IMPORTS");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subgraph(nodes: GraphNode[], edges: GraphEdge[] = []): WorkspaceSubgraph {
  return { nodes, edges, frameworks: [] };
}

// ---------------------------------------------------------------------------
// Output structure
// ---------------------------------------------------------------------------

describe("serializeToMermaid — output structure", () => {
  it("starts with the %%{init}%% directive as the very first line", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out.split("\n")[0]).toBe("%%{init: {'theme': 'default'}}%%");
  });

  it("second line is 'graph TD'", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out.split("\n")[1]).toBe("graph TD");
  });

  it("produces a node line for each node in the subgraph", () => {
    const out = serializeToMermaid(subgraph([FILE_A, FILE_B]), { theme: "Light" });
    const lines = out.split("\n");
    const nodeLines = lines.filter((l) => l.startsWith("  n"));
    expect(nodeLines).toHaveLength(2);
  });

  it("produces an edge line for each valid edge", () => {
    const out = serializeToMermaid(subgraph([FILE_A, FUNC_FOO], [EDGE_DEFINES]), {
      theme: "Light",
    });
    const edgeLines = out.split("\n").filter((l) => l.includes("-->"));
    expect(edgeLines).toHaveLength(1);
  });

  it("emits edges with kind as label", () => {
    const out = serializeToMermaid(subgraph([FILE_A, FUNC_FOO], [EDGE_DEFINES]), {
      theme: "Light",
    });
    expect(out).toContain("-->|DEFINES|");
  });
});

// ---------------------------------------------------------------------------
// Node ID sanitization
// ---------------------------------------------------------------------------

describe("serializeToMermaid — node IDs", () => {
  it("prefixes node IDs with 'n' and replaces hyphens with underscores", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out).toContain("  naaaa_1111_aaaa_1111_aaaaaaaaaaaa[");
  });
});

// ---------------------------------------------------------------------------
// Node labels
// ---------------------------------------------------------------------------

describe("serializeToMermaid — node labels", () => {
  it("labels file nodes with their label text (no symbolKind bracket)", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out).toContain('["src/a.ts"]');
  });

  it("labels symbol nodes with '<name> [<symbolKind>]'", () => {
    const out = serializeToMermaid(subgraph([FUNC_FOO]), { theme: "Light" });
    expect(out).toContain('["foo [function]"]');
  });

  it("labels class symbol nodes correctly", () => {
    const out = serializeToMermaid(subgraph([CLASS_BAR]), { theme: "Light" });
    expect(out).toContain('["Bar [class]"]');
  });

  it("omits kind bracket when symbolKind is undefined (not rendered as '[undefined]')", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { symbolKind: _sk, ...nodeNoKind } = FUNC_FOO;
    const out = serializeToMermaid(subgraph([nodeNoKind]), { theme: "Light" });
    expect(out).not.toContain("[undefined]");
    expect(out).toContain('["foo"]');
  });

  it("HTML-escapes double quotes in labels", () => {
    const node: GraphNode = { ...FILE_A, label: 'say "hello"' };
    const out = serializeToMermaid(subgraph([node]), { theme: "Light" });
    expect(out).toContain("#quot;");
    expect(out).not.toContain('"say "hello"');
  });
});

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

describe("serializeToMermaid — themes", () => {
  it("Light theme produces 'default' Mermaid token", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out.split("\n")[0]).toBe("%%{init: {'theme': 'default'}}%%");
  });

  it("Dark theme produces 'dark' Mermaid token", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Dark" });
    expect(out.split("\n")[0]).toBe("%%{init: {'theme': 'dark'}}%%");
  });

  it("Print theme produces 'neutral' Mermaid token", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Print" });
    expect(out.split("\n")[0]).toBe("%%{init: {'theme': 'neutral'}}%%");
  });
});

// ---------------------------------------------------------------------------
// Determinism (FR-012)
// ---------------------------------------------------------------------------

describe("serializeToMermaid — determinism", () => {
  it("same input produces identical output on repeated calls", () => {
    const sg = subgraph([FILE_A, FILE_B, FUNC_FOO], [EDGE_DEFINES, EDGE_IMPORTS]);
    const a = serializeToMermaid(sg, { theme: "Dark" });
    const b = serializeToMermaid(sg, { theme: "Dark" });
    expect(a).toBe(b);
  });

  it("node order in input does not affect output order", () => {
    const sg1 = subgraph([FILE_A, FILE_B]);
    const sg2 = subgraph([FILE_B, FILE_A]);
    expect(serializeToMermaid(sg1, { theme: "Light" })).toBe(
      serializeToMermaid(sg2, { theme: "Light" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation (FR-009)
// ---------------------------------------------------------------------------

describe("serializeToMermaid — graceful degradation", () => {
  it("exports cleanly when there are no edges", () => {
    const out = serializeToMermaid(subgraph([FILE_A, FILE_B]), { theme: "Light" });
    expect(out).not.toContain("-->");
    expect(out).toContain("graph TD");
  });

  it("single-node graph exports valid Mermaid", () => {
    const out = serializeToMermaid(subgraph([FILE_A]), { theme: "Light" });
    expect(out).toContain("graph TD");
    expect(out.split("\n").filter((l) => l.startsWith("  n"))).toHaveLength(1);
  });

  it("silently drops edges referencing unknown node IDs", () => {
    const orphanEdge = makeEdge("e999", "unknown-src", FILE_A.id, "CALLS");
    const out = serializeToMermaid(subgraph([FILE_A], [orphanEdge]), { theme: "Light" });
    expect(out).not.toContain("-->");
  });

  it("partial edge set (only some nodes missing) produces clean output", () => {
    // EDGE_IMPORTS references FILE_B which is absent
    const out = serializeToMermaid(subgraph([FILE_A, FUNC_FOO], [EDGE_DEFINES, EDGE_IMPORTS]), {
      theme: "Light",
    });
    const edgeLines = out.split("\n").filter((l) => l.includes("-->"));
    expect(edgeLines).toHaveLength(1); // only EDGE_DEFINES survives
  });
});

// ---------------------------------------------------------------------------
// Empty graph guard
// ---------------------------------------------------------------------------

describe("serializeToMermaid — empty graph", () => {
  it("throws when nodes array is empty", () => {
    expect(() => serializeToMermaid(subgraph([]), { theme: "Light" })).toThrow(
      "Graph has no nodes to export",
    );
  });
});

// ---------------------------------------------------------------------------
// Slice 027 — scoped serializer parity
// ---------------------------------------------------------------------------

describe("serializeToScopedMermaid — workspace scope parity with shim", () => {
  it("produces matching node + edge lines vs the legacy shim (only the graph header differs: TB vs TD)", () => {
    const sg = subgraph([FILE_A, FILE_B, FUNC_FOO], [EDGE_DEFINES, EDGE_IMPORTS]);
    const shimOut = serializeToMermaid(sg, { theme: "Light" });
    const scopedOut = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "workspace" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });

    // Headers differ by design: shim post-processes to `graph TD`, scoped path emits `graph TB`.
    expect(shimOut.replace("graph TD", "graph TB")).toBe(scopedOut);
  });
});

describe("serializeToScopedMermaid — file scope", () => {
  // Local fixture so the file and symbol nodes share a consistent filePath
  // (the existing makeSymbolNode helper hard-codes `/workspace/a.ts` and
  // doesn't line up with FILE_A's `/workspace/src/a.ts`).
  const FILE_X: GraphNode = {
    id: "file-x",
    type: "file",
    label: "src/a.ts",
    filePath: "/workspace/src/a.ts",
    startLine: 1,
  };
  const FILE_Y: GraphNode = {
    id: "file-y",
    type: "file",
    label: "src/b.ts",
    filePath: "/workspace/src/b.ts",
    startLine: 1,
  };
  const SYM_X: GraphNode = {
    id: "sym-x",
    type: "symbol",
    label: "fooInA",
    filePath: "/workspace/src/a.ts",
    startLine: 5,
    symbolKind: "function",
  };
  const SYM_Y: GraphNode = {
    id: "sym-y",
    type: "symbol",
    label: "barInB",
    filePath: "/workspace/src/b.ts",
    startLine: 5,
    symbolKind: "function",
  };
  const EDGE_DEF_X: GraphEdge = {
    id: "ed-x",
    source: "file-x",
    target: "sym-x",
    kind: "DEFINES",
  };
  const EDGE_DEF_Y: GraphEdge = {
    id: "ed-y",
    source: "file-y",
    target: "sym-y",
    kind: "DEFINES",
  };
  const EDGE_CROSS: GraphEdge = {
    id: "ec",
    source: "sym-x",
    target: "sym-y",
    kind: "CALLS",
  };

  it("emits only the focused file's nodes and intra-file edges", () => {
    const sg = subgraph([FILE_X, FILE_Y, SYM_X, SYM_Y], [EDGE_DEF_X, EDGE_DEF_Y, EDGE_CROSS]);
    const out = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "file", relativePath: "src/a.ts" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });

    const nodeLines = out.split("\n").filter((l) => /^ {2}n\w+\[/.test(l));
    expect(nodeLines).toHaveLength(2);
    expect(out).not.toContain("src/b.ts");
    expect(out).toContain('["fooInA [function]"]');
  });

  it("drops cross-file edges where one endpoint is outside the file scope", () => {
    const sg = subgraph([FILE_X, FILE_Y, SYM_X, SYM_Y], [EDGE_DEF_X, EDGE_DEF_Y, EDGE_CROSS]);
    const out = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "file", relativePath: "src/a.ts" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });

    const edgeLines = out.split("\n").filter((l) => l.includes("-->"));
    expect(edgeLines).toHaveLength(1);
    expect(out).toContain("-->|DEFINES|");
    expect(out).not.toContain("-->|CALLS|");
  });

  it("produces strictly fewer nodes than the workspace scope when other files exist", () => {
    const sg = subgraph([FILE_X, FILE_Y, SYM_X, SYM_Y], [EDGE_DEF_X, EDGE_DEF_Y, EDGE_CROSS]);
    const workspaceOut = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "workspace" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });
    const fileOut = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "file", relativePath: "src/a.ts" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });

    const workspaceNodes = workspaceOut.split("\n").filter((l) => /^ {2}n\w+\[/.test(l)).length;
    const fileNodes = fileOut.split("\n").filter((l) => /^ {2}n\w+\[/.test(l)).length;
    expect(fileNodes).toBeLessThan(workspaceNodes);
  });

  it("throws with the scope.unsupported reason when the file does not exist", () => {
    const sg = subgraph([FILE_X], []);
    expect(() =>
      serializeToScopedMermaid(sg, {
        diagram: "flowchart",
        scope: { kind: "file", relativePath: "src/missing.ts" },
        granularity: "symbol",
        direction: "auto",
        theme: "Light",
      }),
    ).toThrow(/File not found in indexed graph/);
  });
});

describe("serializeToScopedMermaid — determinism", () => {
  it("same input produces identical output across repeated calls", () => {
    const sg = subgraph([FILE_A, FILE_B, FUNC_FOO], [EDGE_DEFINES, EDGE_IMPORTS]);
    const options = {
      diagram: "flowchart" as const,
      scope: { kind: "workspace" as const },
      granularity: "symbol" as const,
      direction: "auto" as const,
      theme: "Dark" as const,
    };
    const a = serializeToScopedMermaid(sg, options);
    const b = serializeToScopedMermaid(sg, options);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Slice 028 US3 T027 — flowchart path is byte-identical to its slice-027
// behavior. The diagram discriminator must not perturb the flowchart output.
// ---------------------------------------------------------------------------

describe("serializeToScopedMermaid — flowchart path unchanged by slice 028 (US3 T027)", () => {
  it("emits a byte-identical workspace+symbol+light output across the discriminator switch", () => {
    const sg = subgraph([FILE_A, FILE_B, FUNC_FOO, CLASS_BAR], [EDGE_DEFINES, EDGE_IMPORTS]);
    const baseline = [
      "%%{init: {'theme': 'default'}}%%",
      "graph TB",
      '  naaaa_1111_aaaa_1111_aaaaaaaaaaaa["src/a.ts"]',
      '  nbbbb_2222_bbbb_2222_bbbbbbbbbbbb["src/b.ts"]',
      '  ncccc_3333_cccc_3333_cccccccccccc["foo [function]"]',
      '  ndddd_4444_dddd_4444_dddddddddddd["Bar [class]"]',
      "  naaaa_1111_aaaa_1111_aaaaaaaaaaaa -->|DEFINES| ncccc_3333_cccc_3333_cccccccccccc",
      "  nbbbb_2222_bbbb_2222_bbbbbbbbbbbb -->|IMPORTS| naaaa_1111_aaaa_1111_aaaaaaaaaaaa",
    ].join("\n");

    const out = serializeToScopedMermaid(sg, {
      diagram: "flowchart",
      scope: { kind: "workspace" },
      granularity: "symbol",
      direction: "auto",
      theme: "Light",
    });

    expect(out).toBe(baseline);
  });

  it("the slice-016 shim's 'graph TD' post-process still fires unchanged", () => {
    const sg = subgraph([FILE_A, FILE_B, FUNC_FOO], [EDGE_DEFINES, EDGE_IMPORTS]);
    const shimOut = serializeToMermaid(sg, { theme: "Light" });
    expect(shimOut.split("\n")[1]).toBe("graph TD");
  });
});

// ---------------------------------------------------------------------------
// Slice 031 fixtures scaffold (Phase 1 / T003)
// ---------------------------------------------------------------------------
// Reusable trace-route fixtures for the sequence-export tests in T008 (US1).
// Kept at the bottom of this file so the existing fixture block above stays
// focused on flowchart serializer coverage.
// ---------------------------------------------------------------------------

interface TraceFixture {
  subgraph: WorkspaceSubgraph;
  traceNodeIds: readonly string[];
  traceEdgeIds: readonly string[];
}

function buildSlice031LinearTraceFixture(): TraceFixture {
  const cls: GraphNode = {
    id: "c-foo",
    type: "symbol",
    label: "Foo",
    filePath: "/workspace/foo.ts",
    startLine: 1,
    symbolKind: "class",
  };
  const methodA: GraphNode = {
    id: "m-a",
    type: "symbol",
    label: "doA",
    filePath: "/workspace/foo.ts",
    startLine: 2,
    symbolKind: "method",
    enclosingSymbolId: "c-foo",
  };
  const methodB: GraphNode = {
    id: "m-b",
    type: "symbol",
    label: "doB",
    filePath: "/workspace/foo.ts",
    startLine: 5,
    symbolKind: "method",
    enclosingSymbolId: "c-foo",
  };
  const callEdge: GraphEdge = { id: "e-ab", source: "m-a", target: "m-b", kind: "CALLS" };
  return {
    subgraph: { nodes: [cls, methodA, methodB], edges: [callEdge], frameworks: [] },
    traceNodeIds: ["m-a", "m-b"],
    traceEdgeIds: ["e-ab"],
  };
}

describe("Slice 031 trace fixtures (Phase 1 scaffold)", () => {
  it("buildSlice031LinearTraceFixture returns a populated trace subgraph", () => {
    const fx = buildSlice031LinearTraceFixture();
    expect(fx.subgraph.nodes.length).toBeGreaterThan(0);
    expect(fx.traceNodeIds.length).toBeGreaterThan(0);
    expect(fx.traceEdgeIds.length).toBeGreaterThan(0);
  });
});
