import { describe, expect, it } from "vitest";

import { inferMermaidDirection } from "./direction.js";

describe("inferMermaidDirection", () => {
  it("returns LR for symbol-callers (call chains read left to right)", () => {
    expect(inferMermaidDirection({ kind: "symbol-callers", symbolId: "any" })).toBe("LR");
  });

  it("returns LR for symbol-callees (call chains read left to right)", () => {
    expect(inferMermaidDirection({ kind: "symbol-callees", symbolId: "any" })).toBe("LR");
  });

  it("returns TB for the workspace scope (hierarchy reads top-down)", () => {
    expect(inferMermaidDirection({ kind: "workspace" })).toBe("TB");
  });

  it("returns TB for the file scope (folder shape reads top-down)", () => {
    expect(inferMermaidDirection({ kind: "file", relativePath: "src/a.ts" })).toBe("TB");
  });

  it("is deterministic — same scope kind always returns the same direction", () => {
    expect(inferMermaidDirection({ kind: "workspace" })).toBe(
      inferMermaidDirection({ kind: "workspace" }),
    );
    expect(inferMermaidDirection({ kind: "symbol-callers", symbolId: "x", maxDepth: 4 })).toBe(
      inferMermaidDirection({ kind: "symbol-callers", symbolId: "x", maxDepth: 4 }),
    );
  });
});
