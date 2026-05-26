import { describe, expect, it } from "vitest";
import {
  resolveInferredMermaidExport,
  type MermaidSelectionContext,
} from "./inferredMermaidExport.js";

describe("resolveInferredMermaidExport", () => {
  const symbolCtx: MermaidSelectionContext = {
    kind: "symbol",
    symbolId: "sym-1",
    filePath: "src/index.ts",
  };
  const fileCtx: MermaidSelectionContext = {
    kind: "file",
    relativePath: "src/index.ts",
  };
  const folderCtx: MermaidSelectionContext = {
    kind: "folder",
    relativePath: "src",
  };
  const traceCtx: MermaidSelectionContext = {
    kind: "trace",
    startSymbolId: "a",
    endSymbolId: "b",
  };
  const viewCtx: MermaidSelectionContext = {
    kind: "current-view",
    viewId: "v1",
  };

  it("resolves generic-selection symbol to symbol-callers scope", () => {
    const result = resolveInferredMermaidExport("generic-selection", symbolCtx);
    expect(result?.scope).toEqual({ kind: "symbol-callers", symbolId: "sym-1" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("LR");
  });

  it("resolves generic-selection file to file scope", () => {
    const result = resolveInferredMermaidExport("generic-selection", fileCtx);
    expect(result?.scope).toEqual({ kind: "file", relativePath: "src/index.ts" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("resolves generic-selection folder to workspace scope", () => {
    const result = resolveInferredMermaidExport("generic-selection", folderCtx);
    expect(result?.scope).toEqual({ kind: "workspace" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("returns null for generic-selection with unsupported context kind", () => {
    const result = resolveInferredMermaidExport("generic-selection", traceCtx);
    expect(result).toBeNull();
  });

  it("resolves callers from symbol context", () => {
    const result = resolveInferredMermaidExport("callers", symbolCtx);
    expect(result?.scope).toEqual({ kind: "symbol-callers", symbolId: "sym-1" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("LR");
  });

  it("returns null for callers from non-symbol context", () => {
    const result = resolveInferredMermaidExport("callers", fileCtx);
    expect(result).toBeNull();
  });

  it("resolves callees from symbol context", () => {
    const result = resolveInferredMermaidExport("callees", symbolCtx);
    expect(result?.scope).toEqual({ kind: "symbol-callees", symbolId: "sym-1" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("LR");
  });

  it("returns null for callees from non-symbol context", () => {
    const result = resolveInferredMermaidExport("callees", fileCtx);
    expect(result).toBeNull();
  });

  it("resolves class-hierarchy to classDiagram from symbol context", () => {
    const result = resolveInferredMermaidExport("class-hierarchy", symbolCtx);
    expect(result?.scope).toEqual({ kind: "symbol-callers", symbolId: "sym-1" });
    expect(result?.diagram).toBe("classDiagram");
    expect(result?.direction).toBe("TB");
  });

  it("returns null for class-hierarchy from non-symbol context", () => {
    const result = resolveInferredMermaidExport("class-hierarchy", fileCtx);
    expect(result).toBeNull();
  });

  it("resolves package from folder context", () => {
    const result = resolveInferredMermaidExport("package", folderCtx);
    expect(result?.scope).toEqual({ kind: "workspace" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("resolves package from file context", () => {
    const result = resolveInferredMermaidExport("package", fileCtx);
    expect(result?.scope).toEqual({ kind: "file", relativePath: "src/index.ts" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("returns null for package from symbol context", () => {
    const result = resolveInferredMermaidExport("package", symbolCtx);
    expect(result).toBeNull();
  });

  it("resolves trace from trace context", () => {
    const result = resolveInferredMermaidExport("trace", traceCtx);
    expect(result?.scope).toEqual({ kind: "workspace" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("returns null for trace from non-trace context", () => {
    const result = resolveInferredMermaidExport("trace", symbolCtx);
    expect(result).toBeNull();
  });

  it("resolves current-view from current-view context", () => {
    const result = resolveInferredMermaidExport("current-view", viewCtx);
    expect(result?.scope).toEqual({ kind: "workspace" });
    expect(result?.diagram).toBe("flowchart");
    expect(result?.direction).toBe("TB");
  });

  it("returns null for current-view from non-current-view context", () => {
    const result = resolveInferredMermaidExport("current-view", symbolCtx);
    expect(result).toBeNull();
  });
});
