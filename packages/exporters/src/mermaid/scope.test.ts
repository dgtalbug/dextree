import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import { extractMermaidScope } from "./scope.js";

// ---------------------------------------------------------------------------
// Fixture: two files, each with one symbol, plus a CALLS edge across files
// ---------------------------------------------------------------------------

const FILE_A: GraphNode = {
  id: "file-a",
  type: "file",
  label: "src/a.ts",
  filePath: "/workspace/src/a.ts",
  startLine: 1,
};
const FILE_B: GraphNode = {
  id: "file-b",
  type: "file",
  label: "src/b.ts",
  filePath: "/workspace/src/b.ts",
  startLine: 1,
};
const SYMBOL_A: GraphNode = {
  id: "sym-a",
  type: "symbol",
  label: "foo",
  filePath: "/workspace/src/a.ts",
  startLine: 5,
  symbolKind: "function",
};
const SYMBOL_B: GraphNode = {
  id: "sym-b",
  type: "symbol",
  label: "bar",
  filePath: "/workspace/src/b.ts",
  startLine: 5,
  symbolKind: "function",
};

const EDGE_DEFINES_A: GraphEdge = {
  id: "e-def-a",
  source: "file-a",
  target: "sym-a",
  kind: "DEFINES",
};
const EDGE_DEFINES_B: GraphEdge = {
  id: "e-def-b",
  source: "file-b",
  target: "sym-b",
  kind: "DEFINES",
};
const EDGE_CALLS: GraphEdge = {
  id: "e-calls",
  source: "sym-a",
  target: "sym-b",
  kind: "CALLS",
};

const WORKSPACE: WorkspaceSubgraph = {
  nodes: [FILE_A, FILE_B, SYMBOL_A, SYMBOL_B],
  edges: [EDGE_DEFINES_A, EDGE_DEFINES_B, EDGE_CALLS],
  frameworks: [],
};

// ---------------------------------------------------------------------------
// Workspace scope — identity pass-through
// ---------------------------------------------------------------------------

describe("extractMermaidScope — workspace", () => {
  it("returns the input subgraph reference unchanged", () => {
    const result = extractMermaidScope(WORKSPACE, { kind: "workspace" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.subgraph).toBe(WORKSPACE);
    }
  });
});

// ---------------------------------------------------------------------------
// File scope — induced subgraph via graphology-operators.subgraph()
// ---------------------------------------------------------------------------

describe("extractMermaidScope — file", () => {
  it("returns only the matching file node + its symbols when relativePath matches one file", () => {
    const result = extractMermaidScope(WORKSPACE, { kind: "file", relativePath: "src/a.ts" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const ids = result.subgraph.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(["file-a", "sym-a"]);
    }
  });

  it("drops cross-file edges where one endpoint is outside the file scope", () => {
    const result = extractMermaidScope(WORKSPACE, { kind: "file", relativePath: "src/a.ts" });
    if (result.status === "ok") {
      const edgeKinds = result.subgraph.edges.map((e) => e.kind);
      // DEFINES (file-a → sym-a) survives; CALLS (sym-a → sym-b) is dropped because sym-b
      // is outside the file scope.
      expect(edgeKinds).toEqual(["DEFINES"]);
    }
  });

  it("matches by suffix so an absolute filePath against a workspace-relative scope works", () => {
    const result = extractMermaidScope(WORKSPACE, { kind: "file", relativePath: "src/b.ts" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const ids = result.subgraph.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(["file-b", "sym-b"]);
    }
  });

  it("returns unsupported when no file in the workspace matches the relativePath", () => {
    const result = extractMermaidScope(WORKSPACE, {
      kind: "file",
      relativePath: "src/missing.ts",
    });
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toMatch(/File not found in indexed graph/);
      expect(result.reason).toContain("src/missing.ts");
    }
  });

  it("preserves the workspace's frameworks list on the focused subgraph", () => {
    const sgWithFrameworks: WorkspaceSubgraph = {
      ...WORKSPACE,
      frameworks: [{ name: "react", detectionSource: "manifest", confidence: 1 }],
    };
    const result = extractMermaidScope(sgWithFrameworks, {
      kind: "file",
      relativePath: "src/a.ts",
    });
    if (result.status === "ok") {
      expect(result.subgraph.frameworks).toEqual([
        { name: "react", detectionSource: "manifest", confidence: 1 },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// Forward-compatibility seam — symbol scopes return unsupported until a
// later slice implements BFS-based extraction
// ---------------------------------------------------------------------------

describe("extractMermaidScope — future scope kinds", () => {
  it("returns unsupported for symbol-callers in this build", () => {
    const result = extractMermaidScope(WORKSPACE, {
      kind: "symbol-callers",
      symbolId: "sym-a",
    });
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toMatch(/not implemented in this build/);
    }
  });

  it("returns unsupported for symbol-callees in this build", () => {
    const result = extractMermaidScope(WORKSPACE, {
      kind: "symbol-callees",
      symbolId: "sym-a",
    });
    expect(result.status).toBe("unsupported");
  });
});
