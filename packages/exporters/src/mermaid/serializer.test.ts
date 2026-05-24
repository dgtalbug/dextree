import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";
import { serializeToMermaid } from "./serializer.js";

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
  return { nodes, edges };
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
