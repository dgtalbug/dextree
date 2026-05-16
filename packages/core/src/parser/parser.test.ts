import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  });
});
