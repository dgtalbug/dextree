import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractTypeScriptFile, extractTypeScriptSource } from "./index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "../..");
const wasmDir = resolve(packageRoot, "node_modules");
const fixtureDir = resolve(testDir, "__fixtures__");

describe("extractTypeScriptSource", () => {
  it("extracts top-level symbols and builds workspace-relative FQNs", async () => {
    const absolutePath = resolve(fixtureDir, "greet.ts");
    const source = await readFile(absolutePath, "utf8");

    const result = await extractTypeScriptSource(absolutePath, packageRoot, source, wasmDir);

    expect(result.file.relativePath).toBe("src/parser/__fixtures__/greet.ts");
    expect(result.symbols).toHaveLength(2);
    expect(result.symbols.map((symbol) => symbol.fqn)).toEqual([
      "src/parser/__fixtures__/greet.ts:greet",
      "src/parser/__fixtures__/greet.ts:version",
    ]);
    expect(result.symbols.map((symbol) => symbol.kind)).toEqual(["function", "variable"]);
  });

  it("returns zero symbols for a file with no top-level declarations", async () => {
    const absolutePath = resolve(fixtureDir, "empty.ts");
    const result = await extractTypeScriptFile(absolutePath, packageRoot, wasmDir);

    expect(result.file.relativePath).toBe("src/parser/__fixtures__/empty.ts");
    expect(result.symbols).toHaveLength(0);
    expect(result.imports).toEqual([]);
  });

  // Slice 028 US2: class methods carry the parent class symbol id via
  // enclosingSymbolId so the classDiagram serializer can group methods under
  // their owning class without name-matching FQNs. Top-level symbols leave
  // enclosingSymbolId undefined. The change lives in buildMethodSymbols in
  // packages/core/src/parser/extractor.ts; the dependency-task description
  // (T018) names ClassRelationExtractor by mistake — class-relation
  // extraction emits edges only, not symbols.
  it("stamps every class method's enclosingSymbolId with the parent class symbol id (slice 028)", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "dextree-parser-cls-"));
    const filePath = join(workspaceRoot, "Animal.ts");
    try {
      const source =
        "export class Animal {\n" + "  eat() { return 1; }\n" + "  sleep() { return 2; }\n" + "}\n";
      await writeFile(filePath, source, "utf8");

      const result = await extractTypeScriptSource(filePath, workspaceRoot, source, wasmDir);
      const classSym = result.symbols.find((s) => s.name === "Animal");
      const eatSym = result.symbols.find((s) => s.name === "Animal.eat");
      const sleepSym = result.symbols.find((s) => s.name === "Animal.sleep");

      expect(classSym).toBeDefined();
      expect(eatSym?.enclosingSymbolId).toBe(classSym?.id);
      expect(sleepSym?.enclosingSymbolId).toBe(classSym?.id);
      // The class itself is top-level → undefined.
      expect(classSym?.enclosingSymbolId).toBeUndefined();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("leaves enclosingSymbolId undefined for top-level functions and variables (slice 028)", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "dextree-parser-top-"));
    const filePath = join(workspaceRoot, "top.ts");
    try {
      const source = "export function greet() {}\nexport const value = 1;\n";
      await writeFile(filePath, source, "utf8");

      const result = await extractTypeScriptSource(filePath, workspaceRoot, source, wasmDir);
      for (const sym of result.symbols) {
        expect(sym.enclosingSymbolId).toBeUndefined();
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("extracts relative import refs that resolve within the workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "dextree-parser-"));
    const srcDir = join(workspaceRoot, "src");
    const importerPath = join(srcDir, "importer.ts");
    const dependencyPath = join(srcDir, "dep.ts");

    try {
      await mkdir(srcDir, { recursive: true });
      await writeFile(dependencyPath, "export const dep = 1;\n", "utf8");

      const source = 'import { dep } from "./dep";\nexport const value = dep;\n';
      const result = await extractTypeScriptSource(importerPath, workspaceRoot, source, wasmDir);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0]).toMatchObject({
        fileId: result.file.id,
        importPath: "src/dep.ts",
        language: "typescript",
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
