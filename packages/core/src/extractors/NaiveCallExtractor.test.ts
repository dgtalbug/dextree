import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTypeScriptSource } from "../parser/parser.js";
import { NaiveCallExtractor } from "./NaiveCallExtractor.js";
import type { ExtractInput } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(testDir, "__fixtures__/naive-call-cases");
const workspaceRoot = resolve(testDir, "../..");

async function makeInput(fixture: string): Promise<{ input: ExtractInput; cleanup: () => void }> {
  const absolutePath = resolve(fixtureDir, fixture);
  const source = await readFile(absolutePath, "utf8");
  const tree = await parseTypeScriptSource(source, resolve(workspaceRoot, "node_modules"));
  return {
    input: {
      absolutePath,
      workspaceRoot,
      language: "typescript",
      source,
      tree,
      fileId: "test-file-id",
    },
    cleanup: () => tree.delete(),
  };
}

describe("NaiveCallExtractor", () => {
  it("case 1 — intra-file: a() calls b()", async () => {
    const { input, cleanup } = await makeInput("intra-file.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      // Should have at least one CALLS edge
      expect(result.edges.length).toBeGreaterThanOrEqual(1);
      expect(result.symbols).toEqual([]);
      expect(result.imports).toEqual([]);
      expect(result.file).toBeNull();

      // Find the b() call
      const bCall = result.edges.find((e) => e.metadata["callee_name"] === "b");
      expect(bCall).toBeDefined();
      expect(bCall?.kind).toBe("CALLS");
      expect(bCall?.targetId).not.toBeNull(); // same-file symbol b exists
    } finally {
      cleanup();
    }
  });

  it("case 2 — recursion: f() calls itself", async () => {
    const { input, cleanup } = await makeInput("recursion.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const fCall = result.edges.find((e) => e.metadata["callee_name"] === "f");
      expect(fCall).toBeDefined();
      expect(fCall?.kind).toBe("CALLS");
      // Self-call: source and target should both reference function f's scope
      expect(fCall?.sourceId).toBeDefined();
      expect(fCall?.targetId).not.toBeNull(); // f is defined in same file
      // targetId should be the same symbol as sourceId (self-loop)
      expect(fCall?.sourceId).toBe(fCall?.targetId);
    } finally {
      cleanup();
    }
  });

  it("case 3 — cross-file: foo() is imported, target_id is null", async () => {
    const { input, cleanup } = await makeInput("cross-file-caller.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const fooCall = result.edges.find((e) => e.metadata["callee_name"] === "foo");
      expect(fooCall).toBeDefined();
      expect(fooCall?.kind).toBe("CALLS");
      expect(fooCall?.targetId).toBeNull(); // cross-file — not resolved in pass 1
    } finally {
      cleanup();
    }
  });

  it("case 4 — method call: x.foo() — callee_name is 'process'", async () => {
    const { input, cleanup } = await makeInput("method-call.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const processCall = result.edges.find((e) => e.metadata["callee_name"] === "process");
      expect(processCall).toBeDefined();
      expect(processCall?.kind).toBe("CALLS");
      // 'process' is a same-file method — may or may not resolve depending on walk
    } finally {
      cleanup();
    }
  });

  it("case 5 — indirect call: cb() — callee_name is 'cb', target_id null", async () => {
    const { input, cleanup } = await makeInput("indirect-call.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const cbCall = result.edges.find((e) => e.metadata["callee_name"] === "cb");
      expect(cbCall).toBeDefined();
      expect(cbCall?.kind).toBe("CALLS");
      // 'cb' is a variable_declarator, not a top-level function — target_id null
      expect(cbCall?.targetId).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("case 6 — arrow callback: other(x) is the callee", async () => {
    const { input, cleanup } = await makeInput("arrow-callback.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const otherCall = result.edges.find((e) => e.metadata["callee_name"] === "other");
      expect(otherCall).toBeDefined();
      expect(otherCall?.kind).toBe("CALLS");
      // source_id should be a symbol id or file id (not undefined)
      expect(otherCall?.sourceId).toBeDefined();
      // 'other' is defined in same file — target_id resolves
      expect(otherCall?.targetId).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("case 9 — chained call: getFoo().bar() emits two CALLS edges", async () => {
    const { input, cleanup } = await makeInput("chained-call.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      const getFooCall = result.edges.find((e) => e.metadata["callee_name"] === "getFoo");
      const barCall = result.edges.find((e) => e.metadata["callee_name"] === "bar");

      expect(getFooCall).toBeDefined();
      expect(barCall).toBeDefined();
      expect(getFooCall?.kind).toBe("CALLS");
      expect(barCall?.kind).toBe("CALLS");
      // Both are within the same enclosing 'run' function scope
      expect(getFooCall?.sourceId).toBe(barCall?.sourceId);
    } finally {
      cleanup();
    }
  });

  it("returns empty result for null tree", async () => {
    const extractor = new NaiveCallExtractor();
    const result = await extractor.extract({
      absolutePath: "/x.ts",
      workspaceRoot: "/",
      language: "typescript",
      source: "foo();",
      tree: null,
      fileId: "f1",
    });
    expect(result.edges).toEqual([]);
    expect(result.file).toBeNull();
  });

  it("returns empty result for unsupported language", async () => {
    const extractor = new NaiveCallExtractor();
    expect(extractor.supports("python")).toBe(false);
    const result = await extractor.extract({
      absolutePath: "/x.py",
      workspaceRoot: "/",
      language: "python",
      source: "foo()",
      tree: null,
      fileId: "f1",
    });
    expect(result.edges).toEqual([]);
  });

  it("metadata shape includes callee_name, call_site_range (1-based lines), and language", async () => {
    const { input, cleanup } = await makeInput("intra-file.ts");
    try {
      const extractor = new NaiveCallExtractor();
      const result = await extractor.extract(input);

      expect(result.edges.length).toBeGreaterThan(0);
      const edge = result.edges[0]!;
      expect(edge.metadata).toMatchObject({
        callee_name: expect.any(String),
        call_site_range: {
          start_line: expect.any(Number),
          start_col: expect.any(Number),
          end_line: expect.any(Number),
          end_col: expect.any(Number),
        },
        language: "typescript",
      });
      // Lines must be 1-based (≥ 1)
      expect((edge.metadata["call_site_range"] as { start_line: number }).start_line).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});
