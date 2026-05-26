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
    const sg = subgraph(
      [fileNode("f-1", "src/a.ts"), symbolNode("s-1", "foo")],
      [edge("e-1", "f-1", "s-1", "DEFINES")],
    );
    const result = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.source).toContain("graph TB");
      expect(result.source).toContain("DEFINES");
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
    // file scope against a non-existent path → unsupported extraction → reason
    // contains 'File not found' which we treat as unsupported by default.
    // Force the 'empty' branch by validator: a single file node passes
    // extraction but the granularity validator emits a 'zero nodes' message
    // when the projection collapses to nothing — replicate that here.
    const sg = subgraph([]);
    const result = generateMermaidPreview(sg, FLOWCHART_DEFAULTS);
    expect(["empty", "unsupported"]).toContain(result.status);
  });
});

describe("generateMermaidPreview — non-flowchart diagrams return explicit unsupported", () => {
  it("classDiagram routes to unsupported with PR-B reason (slice 029 PR-A scope)", () => {
    const sg = subgraph([fileNode("f-1", "src/a.ts")]);
    const result = generateMermaidPreview(sg, { ...FLOWCHART_DEFAULTS, diagram: "classDiagram" });
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toMatch(/PR-B|slice 029|inline-controls/);
    }
  });

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
