import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import { generateMermaidPreview, type MermaidPreviewOptions } from "./preview.js";

function fileNode(id: string, label: string): GraphNode {
  return { id, type: "file", label, filePath: `/workspace/${label}`, startLine: 0 };
}

function symbolNode(id: string, label: string): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 1,
    symbolKind: "function",
  };
}

function classNode(
  id: string,
  label: string,
  symbolKind: "class" | "interface" | "enum" = "class",
): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 1,
    symbolKind,
  };
}

function methodNode(id: string, label: string, parentClassId: string): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 1,
    symbolKind: "function",
    enclosingSymbolId: parentClassId,
  };
}

function edge(id: string, source: string, target: string, kind: GraphEdge["kind"]): GraphEdge {
  return { id, source, target, kind };
}

function subgraph(nodes: GraphNode[], edges: GraphEdge[] = []): WorkspaceSubgraph {
  return { nodes, edges, frameworks: [] };
}

const FLOWCHART_DEFAULTS: MermaidPreviewOptions = {
  diagram: "flowchart",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "light",
};

describe("generateMermaidPreview — flowchart routing (slice 029 PR-A)", () => {
  it("returns ok with source + title for a populated workspace subgraph", () => {
    // Workspace defaults floor to file granularity, so the export is file-level:
    // two files joined by an IMPORTS edge that survives the symbol fold.
    const sg = subgraph(
      [fileNode("f-1", "src/a.ts"), fileNode("f-2", "src/b.ts")],
      [edge("e-1", "f-2", "f-1", "IMPORTS")],
    );
    const result = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.source).toContain("graph TB");
      expect(result.source).toContain("IMPORTS");
      expect(result.source).not.toContain("[function]");
      expect(result.title).toContain("flowchart");
      expect(result.title).toContain("Workspace");
    }
  });

  it("threads the resolved theme through to the scoped serializer", () => {
    const sg = subgraph([fileNode("f-1", "src/a.ts")]);
    const light = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    const dark = generateMermaidPreview(sg, { ...FLOWCHART_DEFAULTS, theme: "dark" });
    if (light.status === "ok" && dark.status === "ok") {
      expect(light.source).toContain("'theme': 'default'");
      expect(dark.source).toContain("'theme': 'dark'");
    } else {
      throw new Error("expected both light and dark routes to succeed");
    }
  });

  it("title carries the file relative path when scope is file", () => {
    const sg = subgraph([
      { ...fileNode("f-1", "src/a.ts"), filePath: "/workspace/src/a.ts" },
      { ...symbolNode("s-1", "foo"), filePath: "/workspace/src/a.ts" },
    ]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      scope: { kind: "file", relativePath: "src/a.ts" },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.title).toContain("src/a.ts");
    }
  });

  it("title labels the visible scope with the rendered node count", () => {
    const sg = subgraph([
      { ...fileNode("f-1", "src/a.ts"), filePath: "/workspace/src/a.ts" },
      { ...symbolNode("s-1", "foo"), filePath: "/workspace/src/a.ts" },
    ]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      scope: { kind: "visible", nodeIds: ["f-1", "s-1"], edgeIds: [] },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.title).toContain("Current view · 2 nodes");
    }
  });

  it("is pure — same (subgraph, options) yields the same source across calls", () => {
    const sg = subgraph(
      [fileNode("f-1", "src/a.ts"), symbolNode("s-1", "foo")],
      [edge("e-1", "f-1", "s-1", "DEFINES")],
    );
    const first = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    const second = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    if (first.status === "ok" && second.status === "ok") {
      expect(first.source).toBe(second.source);
    }
  });

  it("classifies scoped-serializer empty failures as 'empty'", () => {
    // Zero-node workspace subgraph routes through extractMermaidScope (ok with
    // empty result) and into validateScopedMermaidExport, which emits a
    // 'zero nodes' reason that classifyFailure maps to status: 'empty'.
    const sg = subgraph([]);
    const result = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    expect(result.status).toBe("empty");
  });
});

describe("generateMermaidPreview — classDiagram routing (slice 029 PR-B / US2)", () => {
  it("returns ok with classDiagram source for a subgraph with class-like symbols", () => {
    const sg = subgraph([
      classNode("c-1", "Foo"),
      classNode("c-2", "Bar", "interface"),
      methodNode("m-1", "doThing", "c-1"),
    ]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "classDiagram",
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.source).toContain("classDiagram");
      expect(result.source).toContain("class Foo");
      expect(result.source).toContain("class Bar");
      expect(result.source).toContain("+doThing()");
      expect(result.title).toContain("classDiagram");
    }
  });

  it("classifies 'no class symbols in scope' as unsupported", () => {
    // Subgraph has nodes but none are class/interface/enum — the validator
    // returns unsupported with "No class, interface, or enum symbols…" which
    // classifyFailure maps to status: "unsupported".
    const sg = subgraph([fileNode("f-1", "src/a.ts"), symbolNode("s-1", "foo")]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "classDiagram",
    });
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toMatch(/class|interface|enum/i);
    }
  });

  it("classifies a fully-empty subgraph as empty for classDiagram too", () => {
    const sg = subgraph([]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "classDiagram",
    });
    expect(result.status).toBe("empty");
  });

  it("threads the resolved theme through the class-diagram serializer", () => {
    const sg = subgraph([classNode("c-1", "Foo")]);
    const light = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "classDiagram",
    });
    const dark = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "classDiagram",
      theme: "dark",
    });
    if (light.status === "ok" && dark.status === "ok") {
      expect(light.source).toContain("'theme': 'default'");
      expect(dark.source).toContain("'theme': 'dark'");
    } else {
      throw new Error("expected both light and dark class-diagram routes to succeed");
    }
  });

  it("is pure — same (subgraph, options) yields the same class-diagram source across calls", () => {
    const sg = subgraph([classNode("c-1", "Foo"), methodNode("m-1", "doThing", "c-1")]);
    const opts: MermaidPreviewOptions = { ...FLOWCHART_DEFAULTS, diagram: "classDiagram" };
    const first = generateMermaidPreview(sg, opts);
    const second = generateMermaidPreview(sg, opts);
    if (first.status === "ok" && second.status === "ok") {
      expect(first.source).toBe(second.source);
    } else {
      throw new Error("expected both class-diagram calls to succeed");
    }
  });
});

describe("generateMermaidPreview — sequenceDiagram stays explicit-unsupported until slice 031", () => {
  it("sequenceDiagram routes to unsupported with slice-031 reason", () => {
    const sg = subgraph([fileNode("f-1", "src/a.ts")]);
    const result = generateMermaidPreview(sg, {
      ...FLOWCHART_DEFAULTS,
      diagram: "sequenceDiagram",
    });
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toMatch(/slice 031|sequence/i);
    }
  });

  it("unsupported result preserves the requested options so the tab can re-render the controls", () => {
    const sg = subgraph([fileNode("f-1", "src/a.ts")]);
    const opts: MermaidPreviewOptions = {
      ...FLOWCHART_DEFAULTS,
      diagram: "sequenceDiagram",
      direction: "LR",
    };
    const result = generateMermaidPreview(sg, opts);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.options).toEqual(opts);
    }
  });
});
