import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTypeScriptSource } from "../parser/parser.js";
import { ClassRelationExtractor } from "./ClassRelationExtractor.js";
import type { ExtractInput } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(testDir, "__fixtures__/class-relation-cases");
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

describe("ClassRelationExtractor", () => {
  it("emits INHERITS edges for single-level extends", async () => {
    const { input, cleanup } = await makeInput("inherits-same-file.ts");
    try {
      const extractor = new ClassRelationExtractor();
      const result = await extractor.extract(input);

      expect(result.file).toBeNull();
      expect(result.symbols).toEqual([]);
      expect(result.imports).toEqual([]);

      // Dog extends Animal
      const dogEdge = result.edges.find(
        (e) => e.kind === "INHERITS" && e.metadata["source_fqn"]?.toString().includes(":Dog"),
      );
      expect(dogEdge).toBeDefined();
      expect(dogEdge?.kind).toBe("INHERITS");
      expect(dogEdge?.sourceId).toBe("test-file-id"); // placeholder until SQL resolves
      expect(dogEdge?.targetId).toBeNull();
      expect(dogEdge?.metadata["parent_name"]).toBe("Animal");

      // GoldenRetriever extends Dog
      const goldenEdge = result.edges.find(
        (e) =>
          e.kind === "INHERITS" &&
          e.metadata["source_fqn"]?.toString().includes(":GoldenRetriever"),
      );
      expect(goldenEdge).toBeDefined();
      expect(goldenEdge?.metadata["parent_name"]).toBe("Dog");
    } finally {
      cleanup();
    }
  });

  it("emits exactly 2 INHERITS edges (Dog→Animal, GoldenRetriever→Dog)", async () => {
    const { input, cleanup } = await makeInput("inherits-same-file.ts");
    try {
      const extractor = new ClassRelationExtractor();
      const result = await extractor.extract(input);
      const inheritsEdges = result.edges.filter((e) => e.kind === "INHERITS");
      expect(inheritsEdges).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("emits INSTANTIATES edges for new expressions", async () => {
    const { input, cleanup } = await makeInput("instantiates.ts");
    try {
      const extractor = new ClassRelationExtractor();
      const result = await extractor.extract(input);

      const instantiatesEdges = result.edges.filter((e) => e.kind === "INSTANTIATES");
      // new Dog() in createDog, new Dog() in Trainer constructor, new Dog() in adopt, new Trainer()
      expect(instantiatesEdges.length).toBeGreaterThanOrEqual(3);

      const dogInstantiations = instantiatesEdges.filter((e) => e.metadata["class_name"] === "Dog");
      expect(dogInstantiations.length).toBeGreaterThanOrEqual(1);

      // All INSTANTIATES have placeholder sourceId
      for (const edge of instantiatesEdges) {
        expect(edge.sourceId).toBe("test-file-id");
        expect(edge.targetId).toBeNull();
      }
    } finally {
      cleanup();
    }
  });

  it("returns empty edges for unsupported language", async () => {
    const { input, cleanup } = await makeInput("inherits-same-file.ts");
    try {
      const extractor = new ClassRelationExtractor();
      const result = await extractor.extract({ ...input, language: "python" });
      expect(result.edges).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("supports() returns true for ts/js variants", () => {
    const extractor = new ClassRelationExtractor();
    expect(extractor.supports("typescript")).toBe(true);
    expect(extractor.supports("javascript")).toBe(true);
    expect(extractor.supports("typescriptreact")).toBe(true);
    expect(extractor.supports("python")).toBe(false);
  });
});
