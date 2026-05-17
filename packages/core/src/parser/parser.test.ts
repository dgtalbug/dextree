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
