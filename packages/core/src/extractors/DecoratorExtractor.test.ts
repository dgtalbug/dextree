import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTypeScriptSource } from "../parser/parser.js";
import { DecoratorExtractor } from "./DecoratorExtractor.js";
import type { ExtractInput, KnownSymbol } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(testDir, "__fixtures__/decorator-cases");
const workspaceRoot = resolve(testDir, "../..");

async function makeInput(
  fixture: string,
  knownSymbols: readonly KnownSymbol[] = [],
): Promise<{ input: ExtractInput; cleanup: () => void }> {
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
      knownSymbols,
    },
    cleanup: () => tree.delete(),
  };
}

// ---------------------------------------------------------------------------
// Slice 031 Phase 1 scaffold
// ---------------------------------------------------------------------------
// Real annotation-capture coverage (supported / unsupported decorator shapes)
// lands in T022 (US3 RED tests). This file establishes the module surface so
// subsequent phases can land tests without re-arranging imports.
// ---------------------------------------------------------------------------

describe("DecoratorExtractor module surface (slice 031 Phase 1)", () => {
  it("constructs without error", () => {
    const extractor = new DecoratorExtractor();
    expect(extractor).toBeInstanceOf(DecoratorExtractor);
  });

  it("declares a stable name and version for the registry", () => {
    const extractor = new DecoratorExtractor();
    expect(extractor.name).toBe("decorator");
    expect(typeof extractor.version).toBe("string");
    expect(extractor.version.length).toBeGreaterThan(0);
  });

  it("supports() returns true for TypeScript / TSX languages", () => {
    const extractor = new DecoratorExtractor();
    expect(extractor.supports("typescript")).toBe(true);
    expect(extractor.supports("typescriptreact")).toBe(true);
  });

  it("supports() returns false for languages without decorator syntax in scope", () => {
    const extractor = new DecoratorExtractor();
    // JavaScript decorators are still stage-3; the extractor scopes to TS only.
    expect(extractor.supports("javascript")).toBe(false);
    expect(extractor.supports("python")).toBe(false);
    expect(extractor.supports("go")).toBe(false);
  });

  it("extract() with a null tree returns an empty result with no annotations", async () => {
    const extractor = new DecoratorExtractor();
    const result = await extractor.extract({
      absolutePath: "/workspace/src/Foo.ts",
      workspaceRoot: "/workspace",
      language: "typescript",
      source: "",
      tree: null,
      fileId: "file-1",
      knownSymbols: [],
    });
    expect(result.annotations).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

// knownSymbols matching the two decorated classes in
// `__fixtures__/decorator-cases/decorated-class.ts`. The resolver walks the
// decorator's parent (an `export_statement`) into the wrapped class_declaration
// and matches by name + 0-based startLine. Class_declaration rows are 6 and 9
// (1-based lines 7 and 10 in the fixture).
const DECORATED_CLASS_KNOWN_SYMBOLS = [
  {
    id: "sym-userservice",
    name: "UserService",
    kind: "class",
    startLine: 6,
    startCol: 0,
    endLine: 6,
    endCol: 30,
  },
  {
    id: "sym-appcomponent",
    name: "AppComponent",
    kind: "class",
    startLine: 9,
    startCol: 0,
    endLine: 9,
    endCol: 30,
  },
];

describe("DecoratorExtractor — supported decorator shapes (slice 031 T022)", () => {
  it("emits one annotation row per `@Decorator` and `@Decorator(arg)` on classes", async () => {
    const { input, cleanup } = await makeInput("decorated-class.ts", DECORATED_CLASS_KNOWN_SYMBOLS);
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      // @Injectable on UserService + @Component(...) on AppComponent = 2 rows.
      expect(result.annotations).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("captures the decorator name and language on each emitted row", async () => {
    const { input, cleanup } = await makeInput("decorated-class.ts", DECORATED_CLASS_KNOWN_SYMBOLS);
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      const names = (result.annotations ?? [])
        .map((a) => (a as { name?: unknown }).name)
        .filter((n): n is string => typeof n === "string")
        .sort();
      expect(names).toEqual(["Component", "Injectable"]);

      for (const row of result.annotations ?? []) {
        const lang = (row as { language?: unknown }).language;
        expect(lang).toBe("typescript");
      }
    } finally {
      cleanup();
    }
  });

  it("captures the call-site source text for decorators with arguments", async () => {
    const { input, cleanup } = await makeInput("decorated-class.ts", DECORATED_CLASS_KNOWN_SYMBOLS);
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      const componentRow = (result.annotations ?? []).find(
        (a) => (a as { name?: unknown }).name === "Component",
      ) as { args?: { raw?: unknown } } | undefined;
      expect(componentRow?.args?.raw).toContain("selector");
    } finally {
      cleanup();
    }
  });
});

describe("DecoratorExtractor — files without decorators (slice 031 T022)", () => {
  it("emits zero annotation rows when no decorators are present", async () => {
    const { input, cleanup } = await makeInput("no-decorators.ts");
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      expect(result.annotations).toEqual([]);
      expect(result.edges).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe("DecoratorExtractor — parent-symbol linkage (slice 031 T022, addresses CodeRabbit)", () => {
  it("populates parentSymbolId from knownSymbols when the enclosing class id is known", async () => {
    // `decorated-class.ts` has `@Injectable\nexport class UserService {}`
    // — the class_declaration sits at row 6 (0-based), and the decorator's
    // parent chain walks up through `export_statement` → `class_declaration`
    // (matched first by name+startLine). Wire a knownSymbols entry that
    // mirrors what BaselineTsJsExtractor would have written for that class.
    const userServiceSymbolId = "sym-userservice-stable";
    const { input, cleanup } = await makeInput("decorated-class.ts", [
      {
        id: userServiceSymbolId,
        name: "UserService",
        kind: "class",
        // 0-based row matches `export class UserService {}` declaration line.
        startLine: 6,
        startCol: 0,
        endLine: 6,
        endCol: 30,
      },
    ]);
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      const injectableRow = (result.annotations ?? []).find(
        (a) => (a as { name?: unknown }).name === "Injectable",
      ) as { parentSymbolId?: unknown } | undefined;
      // CodeRabbit flagged that the old impl wrote `""` for unresolved parents,
      // which would mask broken linkage. The fixed impl skips rows without a
      // parent and only emits real foreign keys.
      expect(injectableRow?.parentSymbolId).toBe(userServiceSymbolId);
    } finally {
      cleanup();
    }
  });

  it("skips decorators whose enclosing symbol is not in knownSymbols (no orphan rows)", async () => {
    // Same fixture, but knownSymbols is empty — no parent linkage possible.
    const { input, cleanup } = await makeInput("decorated-class.ts", []);
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract(input);

      // Decorators in the file (@Injectable, @Component) cannot resolve a
      // parent, so the extractor emits zero annotation rows — better than
      // writing `parentSymbolId: ""` and crashing the DB insert later.
      expect(result.annotations).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe("DecoratorExtractor — unsupported languages (slice 031 T022)", () => {
  it("returns an empty result when language is not TS/TSX", async () => {
    const { input, cleanup } = await makeInput("decorated-class.ts");
    try {
      const extractor = new DecoratorExtractor();
      const result = await extractor.extract({ ...input, language: "python" });

      expect(result.annotations).toEqual([]);
      expect(result.edges).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
