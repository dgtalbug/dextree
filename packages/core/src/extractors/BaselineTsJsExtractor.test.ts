import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractTypeScriptSource } from "../parser/extractor.js";
import { parseTypeScriptSource } from "../parser/parser.js";
import { BaselineTsJsExtractor } from "./BaselineTsJsExtractor.js";
import type { ExtractInput } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "../..");
const wasmDir = resolve(packageRoot, "node_modules");
const fixtureDir = resolve(testDir, "../parser/__fixtures__");

function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripIds);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" || key === "fileId") {
        continue;
      }
      out[key] = stripIds(raw);
    }
    return out;
  }
  return value;
}

describe("BaselineTsJsExtractor", () => {
  it("produces the same Symbol / File / Import rows as extractTypeScriptSource (zero regression)", async () => {
    const absolutePath = resolve(fixtureDir, "greet.ts");
    const source = await readFile(absolutePath, "utf8");

    const reference = await extractTypeScriptSource(absolutePath, packageRoot, source, wasmDir);

    const tree = await parseTypeScriptSource(source, wasmDir);
    try {
      const extractor = new BaselineTsJsExtractor();
      const input: ExtractInput = {
        absolutePath,
        workspaceRoot: packageRoot,
        language: "typescript",
        source,
        tree,
        fileId: "test-file-id",
      };
      const result = await extractor.extract(input);

      expect(stripIds(result.file)).toEqual(stripIds(reference.file));
      expect(stripIds(result.symbols)).toEqual(stripIds(reference.symbols));
      expect(stripIds(result.imports)).toEqual(stripIds(reference.imports));
      expect(result.edges).toEqual([]);
    } finally {
      tree.delete();
    }
  });

  it("supports typescript / javascript / typescriptreact / javascriptreact via supports()", () => {
    const extractor = new BaselineTsJsExtractor();
    expect(extractor.supports("typescript")).toBe(true);
    expect(extractor.supports("javascript")).toBe(true);
    expect(extractor.supports("typescriptreact")).toBe(true);
    expect(extractor.supports("javascriptreact")).toBe(true);
    expect(extractor.supports("plaintext")).toBe(false);
    expect(extractor.supports("python")).toBe(false);
  });

  it("returns a minimal file-only ExtractionResult for non-TS languages", async () => {
    const extractor = new BaselineTsJsExtractor();
    const input: ExtractInput = {
      absolutePath: "/workspace/README.md",
      workspaceRoot: "/workspace",
      language: "markdown",
      source: "# hello",
      tree: null,
      fileId: "md-file-id",
    };
    const result = await extractor.extract(input);

    expect(result.file).toBeNull();
    expect(result.symbols).toEqual([]);
    expect(result.imports).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
