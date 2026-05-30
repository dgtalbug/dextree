import { describe, expect, it, vi } from "vitest";

import {
  createDefaultExtractorRegistry,
  DecoratorExtractor,
  ImplementsExtractor,
} from "./index.js";
import { createExtractorRegistry } from "./registry.js";
import type { Extractor, ExtractInput, ExtractionResult } from "./types.js";

function makeInput(overrides: Partial<ExtractInput> = {}): ExtractInput {
  return {
    absolutePath: "/workspace/src/x.ts",
    workspaceRoot: "/workspace",
    language: "typescript",
    source: "",
    tree: null,
    fileId: "file-x",
    knownSymbols: [],
    ...overrides,
  };
}

function emptyResult(): ExtractionResult {
  return {
    file: null,
    symbols: [],
    imports: [],
    edges: [],
    annotations: [],
    modules: [],
    tests: [],
  };
}

describe("ExtractorRegistry", () => {
  it("dispatches a single matching extractor and returns its result", async () => {
    const registry = createExtractorRegistry();
    const customExtractor: Extractor = {
      name: "custom-extractor",
      version: "0.0.1",
      supports: (lang) => lang === "typescript",
      extract: async () => ({
        ...emptyResult(),
        edges: [
          {
            id: "edge-1",
            sourceId: "file-x",
            targetId: null,
            kind: "CUSTOM_X",
            metadata: { hello: "world" },
          },
        ],
      }),
    };
    registry.register(customExtractor);

    const result = await registry.run(makeInput());

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.kind).toBe("CUSTOM_X");
  });

  it("merges multiple extractors in registration order", async () => {
    const registry = createExtractorRegistry();
    const order: string[] = [];

    const a: Extractor = {
      name: "a",
      version: "0",
      supports: () => true,
      extract: async () => {
        order.push("a");
        return {
          ...emptyResult(),
          edges: [{ id: "e-a", sourceId: "f", targetId: null, kind: "A_KIND", metadata: {} }],
        };
      },
    };
    const b: Extractor = {
      name: "b",
      version: "0",
      supports: () => true,
      extract: async () => {
        order.push("b");
        return {
          ...emptyResult(),
          edges: [{ id: "e-b", sourceId: "f", targetId: null, kind: "B_KIND", metadata: {} }],
        };
      },
    };
    registry.register(a);
    registry.register(b);

    const result = await registry.run(makeInput());

    expect(order).toEqual(["a", "b"]);
    expect(result.edges.map((e) => e.kind)).toEqual(["A_KIND", "B_KIND"]);
  });

  it("isolates per-extractor failures and continues with surviving extractors", async () => {
    const warn = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
    const registry = createExtractorRegistry(logger);

    const broken: Extractor = {
      name: "broken",
      version: "0",
      supports: () => true,
      extract: async () => {
        throw new Error("boom");
      },
    };
    const surviving: Extractor = {
      name: "surviving",
      version: "0",
      supports: () => true,
      extract: async () => ({
        ...emptyResult(),
        edges: [{ id: "ok", sourceId: "f", targetId: null, kind: "OK", metadata: {} }],
      }),
    };
    registry.register(broken);
    registry.register(surviving);

    const result = await registry.run(makeInput());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Extractor failed", {
      extractor: "broken",
      file: "/workspace/src/x.ts",
      error: "boom",
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.kind).toBe("OK");
  });

  it("throws when two extractors both populate `file`", async () => {
    const registry = createExtractorRegistry();
    const a: Extractor = {
      name: "a-claims-file",
      version: "0",
      supports: () => true,
      extract: async () => ({
        ...emptyResult(),
        file: {
          id: "fid-a",
          path: "/x.ts",
          relativePath: "x.ts",
          language: "typescript",
          loc: 1,
          hash: "h",
        },
      }),
    };
    const b: Extractor = {
      name: "b-also-claims",
      version: "0",
      supports: () => true,
      extract: async () => ({
        ...emptyResult(),
        file: {
          id: "fid-b",
          path: "/y.ts",
          relativePath: "y.ts",
          language: "typescript",
          loc: 1,
          hash: "h",
        },
      }),
    };
    registry.register(a);
    registry.register(b);

    await expect(registry.run(makeInput())).rejects.toThrow(/Multiple extractors populated `file`/);
  });

  it("returns an empty merged result when no extractor matches the language", async () => {
    const registry = createExtractorRegistry();
    const onlyJava: Extractor = {
      name: "java-only",
      version: "0",
      supports: (lang) => lang === "java",
      extract: async () => ({
        ...emptyResult(),
        edges: [{ id: "j", sourceId: "f", targetId: null, kind: "X", metadata: {} }],
      }),
    };
    registry.register(onlyJava);

    const result = await registry.run(makeInput({ language: "typescript" }));

    expect(result.file).toBeNull();
    expect(result.symbols).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  // Slice 031 T005 — default registry exposes both new pass-1 extractors.
  // Spies on the extractor prototypes prove they were actually dispatched
  // (CodeRabbit flagged that the earlier version of this test would pass
  // even if the extractors were silently dropped from the registry, since
  // `result.edges`/`result.annotations` are empty for a no-op TS input).
  it("createDefaultExtractorRegistry() registers and dispatches Implements + Decorator extractors", async () => {
    const implSpy = vi.spyOn(ImplementsExtractor.prototype, "extract");
    const decSpy = vi.spyOn(DecoratorExtractor.prototype, "extract");
    try {
      const registry = createDefaultExtractorRegistry();
      const result = await registry.run(
        makeInput({ language: "typescript", source: "export const x = 1;" }),
      );
      expect(implSpy).toHaveBeenCalledTimes(1);
      expect(decSpy).toHaveBeenCalledTimes(1);
      expect(result.edges).toEqual([]);
      expect(result.annotations).toEqual([]);
    } finally {
      implSpy.mockRestore();
      decSpy.mockRestore();
    }
  });

  it("rejects duplicate `register()` calls by name", () => {
    const registry = createExtractorRegistry();
    const ext: Extractor = {
      name: "dup",
      version: "0",
      supports: () => true,
      extract: async () => emptyResult(),
    };
    registry.register(ext);

    expect(() => registry.register(ext)).toThrow(/already registered/);
  });
});
