import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTypeScriptSource } from "../parser/parser.js";
import { ImplementsExtractor } from "./ImplementsExtractor.js";
import type { ExtractInput } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(testDir, "__fixtures__/implements-cases");
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
      knownSymbols: [],
    },
    cleanup: () => tree.delete(),
  };
}

// ---------------------------------------------------------------------------
// Slice 031 Phase 1 scaffold
// ---------------------------------------------------------------------------
// Real `IMPLEMENTS` extraction coverage (same-file, qualified, no-interface)
// lands in T015 (US2 RED tests). This file establishes the module surface so
// subsequent phases can land tests without re-arranging imports.
// ---------------------------------------------------------------------------

describe("ImplementsExtractor module surface (slice 031 Phase 1)", () => {
  it("constructs without error", () => {
    const extractor = new ImplementsExtractor();
    expect(extractor).toBeInstanceOf(ImplementsExtractor);
  });

  it("declares a stable name and version for the registry", () => {
    const extractor = new ImplementsExtractor();
    expect(extractor.name).toBe("implements");
    expect(typeof extractor.version).toBe("string");
    expect(extractor.version.length).toBeGreaterThan(0);
  });

  it("supports() returns true for TypeScript / JavaScript languages", () => {
    const extractor = new ImplementsExtractor();
    expect(extractor.supports("typescript")).toBe(true);
    expect(extractor.supports("javascript")).toBe(true);
    expect(extractor.supports("typescriptreact")).toBe(true);
    expect(extractor.supports("javascriptreact")).toBe(true);
  });

  it("supports() returns false for languages outside the TS/JS family", () => {
    const extractor = new ImplementsExtractor();
    expect(extractor.supports("python")).toBe(false);
    expect(extractor.supports("go")).toBe(false);
  });

  it("extract() with a null tree returns an empty result", async () => {
    const extractor = new ImplementsExtractor();
    const result = await extractor.extract({
      absolutePath: "/workspace/src/Foo.ts",
      workspaceRoot: "/workspace",
      language: "typescript",
      source: "",
      tree: null,
      fileId: "file-1",
      knownSymbols: [],
    });
    expect(result.edges).toEqual([]);
    expect(result.annotations).toEqual([]);
  });
});

describe("ImplementsExtractor — same-file interface implementation (slice 031 T015)", () => {
  it("emits one IMPLEMENTS edge for each `class X implements Iface` declaration", async () => {
    const { input, cleanup } = await makeInput("implements-same-file.ts");
    try {
      const extractor = new ImplementsExtractor();
      const result = await extractor.extract(input);

      const implementsEdges = result.edges.filter((e) => e.kind === "IMPLEMENTS");
      // Dog implements Animal  → 1 edge
      // GoldenRetriever implements Animal, Named → 2 edges
      expect(implementsEdges).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it("stamps source_fqn = `${relativePath}:${ClassName}` and interface_name in metadata", async () => {
    const { input, cleanup } = await makeInput("implements-same-file.ts");
    try {
      const extractor = new ImplementsExtractor();
      const result = await extractor.extract(input);

      const dogEdge = result.edges.find(
        (e) => e.kind === "IMPLEMENTS" && e.metadata["source_fqn"]?.toString().endsWith(":Dog"),
      );
      expect(dogEdge).toBeDefined();
      expect(dogEdge?.metadata["interface_name"]).toBe("Animal");
      expect(dogEdge?.sourceId).toBe("test-file-id");
      expect(dogEdge?.targetId).toBeNull();
      expect(dogEdge?.metadata["language"]).toBe("typescript");
    } finally {
      cleanup();
    }
  });

  it("emits a distinct edge for each interface in a comma-separated implements list", async () => {
    const { input, cleanup } = await makeInput("implements-same-file.ts");
    try {
      const extractor = new ImplementsExtractor();
      const result = await extractor.extract(input);

      const goldenEdges = result.edges.filter(
        (e) =>
          e.kind === "IMPLEMENTS" &&
          e.metadata["source_fqn"]?.toString().endsWith(":GoldenRetriever"),
      );
      const interfaceNames = goldenEdges.map((e) => e.metadata["interface_name"]).sort();
      expect(interfaceNames).toEqual(["Animal", "Named"]);
    } finally {
      cleanup();
    }
  });
});

describe("ImplementsExtractor — qualified interface names (slice 031 T015)", () => {
  it("captures the trailing property name from `ns.Iface` member expressions", async () => {
    const { input, cleanup } = await makeInput("implements-qualified.ts");
    try {
      const extractor = new ImplementsExtractor();
      const result = await extractor.extract(input);

      const edge = result.edges.find((e) => e.kind === "IMPLEMENTS");
      expect(edge).toBeDefined();
      // ns.Disposable → records "Disposable" (the property), not "ns" or "ns.Disposable"
      expect(edge?.metadata["interface_name"]).toBe("Disposable");
    } finally {
      cleanup();
    }
  });
});

describe("ImplementsExtractor — files without implements clauses (slice 031 T015)", () => {
  it("emits zero edges when no class uses `implements`", async () => {
    const { input, cleanup } = await makeInput("no-implements.ts");
    try {
      const extractor = new ImplementsExtractor();
      const result = await extractor.extract(input);

      const implementsEdges = result.edges.filter((e) => e.kind === "IMPLEMENTS");
      expect(implementsEdges).toEqual([]);
      // The extractor does not invent IMPLEMENTS edges from `extends` — those
      // belong to ClassRelationExtractor as INHERITS.
      expect(result.edges).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
