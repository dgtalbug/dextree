import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSource } from "../../parser/grammars.js";
import { GenericTagsExtractor } from "../GenericTagsExtractor.js";
import type { ExtractInput } from "../types.js";
import { getLanguageProvider, registeredLanguages } from "./registry.js";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
const wasmDir = resolve(packageRoot, "node_modules");

async function extract(source: string, relPath: string, language: string) {
  const extractor = new GenericTagsExtractor(wasmDir);
  const tree = await parseSource(source, language, wasmDir);
  const input: ExtractInput = {
    absolutePath: resolve("/workspace", relPath),
    workspaceRoot: "/workspace",
    language,
    source,
    tree,
    fileId: "f",
    knownSymbols: [],
  };
  try {
    return await extractor.extract(input);
  } finally {
    tree?.delete();
  }
}

// Each case = a language that must render through the ONE engine with no
// per-language code — only the data (grammar + tags.scm + config) differs.
const CASES = [
  {
    language: "python",
    path: "a.py",
    source:
      "def top_level(x):\n    return inner(x)\n\nclass Service:\n    def run(self):\n        return 1\n",
    expectSymbols: ["top_level", "Service"],
  },
  {
    language: "go",
    path: "a.go",
    source: "package main\n\nfunc TopLevel() int {\n\treturn inner()\n}\n\ntype Service struct{}\n",
    expectSymbols: ["TopLevel"],
  },
  {
    language: "java",
    path: "A.java",
    source:
      "class Service {\n  int run() { return compute(); }\n  int compute() { return 1; }\n}\n",
    expectSymbols: ["Service"],
  },
  {
    language: "ruby",
    path: "a.rb",
    source: "def top_level\n  inner\nend\n\nclass Service\n  def run\n    1\n  end\nend\n",
    expectSymbols: ["top_level", "Service"],
  },
  {
    language: "rust",
    path: "a.rs",
    source: "fn top_level() -> i32 { inner() }\n\nstruct Service;\n",
    expectSymbols: ["top_level"],
  },
  {
    language: "c",
    path: "a.c",
    source: "int add(int a, int b) { return a + b; }\n",
    expectSymbols: ["add"],
  },
  {
    language: "cpp",
    path: "a.cpp",
    source: "class Widget {\npublic:\n  int run() { return 1; }\n};\n",
    expectSymbols: ["Widget"],
  },
  {
    language: "csharp",
    path: "A.cs",
    source: "public class Svc {\n  public int Run() { return 1; }\n}\n",
    expectSymbols: ["Svc"],
  },
  {
    language: "php",
    path: "a.php",
    source:
      "<?php\nfunction top() { return 1; }\nclass PhpSvc { public function run() { return 1; } }\n",
    expectSymbols: ["top", "PhpSvc"],
  },
  {
    language: "elixir",
    path: "a.ex",
    source: "defmodule M do\n  def top do\n    1\n  end\nend\n",
    expectSymbols: ["top"],
  },
  {
    language: "scala",
    path: "a.scala",
    source: "object Svc {\n  def run(): Int = 1\n}\n",
    expectSymbols: ["run"],
  },
];

describe("multi-language extraction (data-only providers)", () => {
  it("registers all expected languages", () => {
    const langs = registeredLanguages();
    for (const c of CASES) {
      expect(langs).toContain(c.language);
      expect(getLanguageProvider(c.language)).toBeDefined();
    }
  });

  for (const c of CASES) {
    it(`renders a graph for ${c.language} through the same engine`, async () => {
      const result = await extract(c.source, c.path, c.language);
      const names = new Set(result.symbols.map((s) => s.name));
      for (const expected of c.expectSymbols) {
        expect(names.has(expected), `${c.language} should define ${expected}`).toBe(true);
      }
      // Symbols carry the correct language tag (engine is generic, data drives it).
      expect(result.symbols.every((s) => s.language === c.language)).toBe(true);
    });
  }

  // IMPORTS edges must exist for non-TS/JS languages whose provider declares
  // import node types (previously the import walk was TS/JS-only).
  const IMPORT_CASES = [
    {
      language: "python",
      path: "a.py",
      source: "import os\nfrom a.b import c\n",
      expect: ["os", "a.b"],
    },
    { language: "go", path: "a.go", source: 'package m\nimport "fmt"\n', expect: ["fmt"] },
    { language: "rust", path: "a.rs", source: "use std::io;\n", expect: ["std::io"] },
  ];

  for (const c of IMPORT_CASES) {
    it(`produces IMPORTS edges for ${c.language}`, async () => {
      const result = await extract(c.source, c.path, c.language);
      expect(result.imports.length).toBeGreaterThan(0);
      // Every import edge is tagged with the file's language, not hardcoded TS.
      expect(result.imports.every((i) => i.language === c.language)).toBe(true);
      const paths = result.imports.map((i) => i.importPath);
      for (const want of c.expect) {
        expect(
          paths.some((p) => p.includes(want)),
          `${c.language} import path should include ${want}; got ${paths.join(", ")}`,
        ).toBe(true);
      }
    });
  }
});
