import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSource } from "../parser/grammars.js";
import { GenericTagsExtractor } from "./GenericTagsExtractor.js";
import type { ExtractInput } from "./types.js";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const wasmDir = resolve(packageRoot, "node_modules");

async function run(source: string, relPath: string, language: string) {
  const extractor = new GenericTagsExtractor(wasmDir);
  const absolutePath = resolve("/workspace", relPath);
  const tree = await parseSource(source, language, wasmDir);
  const input: ExtractInput = {
    absolutePath,
    workspaceRoot: "/workspace",
    language,
    source,
    tree,
    fileId: "file-1",
    knownSymbols: [],
  };
  try {
    return await extractor.extract(input);
  } finally {
    tree?.delete();
  }
}

describe("GenericTagsExtractor", () => {
  it("extracts top-level functions and classes with relativePath fqn", async () => {
    const source = `
      export function topLevel(x) { return x; }
      export class Service {
        run() { return 1; }
      }
    `;
    const result = await run(source, "src/a.ts", "typescript");
    const byName = new Map(result.symbols.map((s) => [s.name, s]));

    expect(byName.get("topLevel")?.kind).toBe("function");
    expect(byName.get("topLevel")?.fqn).toBe("src/a.ts:topLevel");
    expect(byName.get("Service")?.kind).toBe("class");
  });

  it("mints methods with ClassName.method fqn and enclosingSymbolId", async () => {
    const source = `
      class Service {
        run() { return this.compute(); }
        compute() { return 1; }
      }
    `;
    const result = await run(source, "src/b.ts", "typescript");
    const method = result.symbols.find((s) => s.name === "Service.run");

    expect(method).toBeDefined();
    expect(method?.kind).toBe("method");
    expect(method?.fqn).toBe("src/b.ts:Service.run");
    const cls = result.symbols.find((s) => s.name === "Service");
    expect(method?.enclosingSymbolId).toBe(cls?.id);
  });

  it("emits CALLS edges attributed to the enclosing definition (incl. nested)", async () => {
    const source = `
      function outer() {
        function inner() { return helper(); }
        return inner();
      }
    `;
    const result = await run(source, "src/c.ts", "typescript");
    const calls = result.edges.filter((e) => e.kind === "CALLS");

    // helper() is called from inside inner(); inner is captured as a symbol, so
    // the call's source_fqn must point at inner, not the file.
    const helperCall = calls.find((e) => e.metadata.callee_name === "helper");
    expect(helperCall).toBeDefined();
    expect(helperCall?.metadata.source_fqn).toBe("src/c.ts:inner");
  });

  it("emits INHERITS, IMPLEMENTS, and INSTANTIATES edges", async () => {
    const source = `
      interface Runner { run(): number; }
      class Base {}
      class Service extends Base implements Runner {
        run() { return 1; }
      }
      function make() { return new Service(); }
    `;
    const result = await run(source, "src/e.ts", "typescript");
    const kinds = result.edges.map((e) => e.kind);

    expect(kinds).toContain("INHERITS");
    expect(kinds).toContain("IMPLEMENTS");
    expect(kinds).toContain("INSTANTIATES");

    const inherits = result.edges.find((e) => e.kind === "INHERITS");
    expect(inherits?.metadata.parent_name).toBe("Base");
    const implementsEdge = result.edges.find((e) => e.kind === "IMPLEMENTS");
    expect(implementsEdge?.metadata.interface_name).toBe("Runner");
    const instantiates = result.edges.find((e) => e.kind === "INSTANTIATES");
    expect(instantiates?.metadata.class_name).toBe("Service");
  });

  it("emits REFERENCES (type usage) and RE_EXPORTS edges", async () => {
    const source = `
      export * from "./other";
      export { foo } from "./other";
      export function use(v: MyType): number { return 1; }
    `;
    const result = await run(source, "src/f.ts", "typescript");
    const kinds = result.edges.map((e) => e.kind);

    expect(kinds).toContain("REFERENCES");
    expect(kinds).toContain("RE_EXPORTS");

    const ref = result.edges.find((e) => e.kind === "REFERENCES");
    expect(ref?.metadata.referenced_name).toBe("MyType");
    const reexport = result.edges.find((e) => e.kind === "RE_EXPORTS");
    expect(reexport?.metadata.reexport_path).toBe("./other");
  });

  it("is generic: the SAME engine extracts Python via its provider (data-only)", async () => {
    // Python provider is registered in Phase 2; this asserts the mechanism is
    // language-agnostic once a provider exists. Skipped until the provider lands.
    const provider = (await import("./languages/registry.js")).getLanguageProvider("python");
    if (provider === undefined) {
      return; // Python provider not registered yet (Phase 2)
    }
    const source = "def top_level(x):\n    return inner(x)\n";
    const result = await run(source, "src/d.py", "python");
    expect(result.symbols.some((s) => s.name === "top_level")).toBe(true);
  });
});
