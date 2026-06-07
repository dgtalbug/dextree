// Generates language provider modules from installed tree-sitter grammar packages.
// "Adding a language = data": this reads each grammar's upstream queries/tags.scm
// and emits a provider TS module embedding it. Re-run after bumping a grammar:
//   pnpm --filter @dextree/core gen:tags
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(here, "..");
const nm = resolve(coreRoot, "node_modules");
const outDir = resolve(coreRoot, "src/extractors/languages/generated");

// One entry per language. The ONLY per-language data: package name + which
// detectLanguage value(s) it serves + the default capture→kind config.
// `imports` = top-level AST node types that represent an import in that grammar,
// used to emit IMPORTS edges. Empty/omitted → the language emits no IMPORTS.
const LANGUAGES = [
  {
    pkg: "tree-sitter-python",
    languages: ["python"],
    imports: ["import_statement", "import_from_statement"],
  },
  { pkg: "tree-sitter-go", languages: ["go"], imports: ["import_declaration"] },
  { pkg: "tree-sitter-java", languages: ["java"], imports: ["import_declaration"] },
  { pkg: "tree-sitter-ruby", languages: ["ruby"], imports: [] },
  { pkg: "tree-sitter-rust", languages: ["rust"], imports: ["use_declaration"] },
  { pkg: "tree-sitter-c", languages: ["c"], imports: ["preproc_include"] },
  { pkg: "tree-sitter-cpp", languages: ["cpp"], imports: ["preproc_include"] },
  { pkg: "tree-sitter-c-sharp", languages: ["csharp"], imports: ["using_directive"] },
  { pkg: "tree-sitter-php", languages: ["php"], imports: ["namespace_use_declaration"] },
  { pkg: "tree-sitter-elixir", languages: ["elixir"], imports: [] },
  { pkg: "tree-sitter-scala", languages: ["scala"], imports: ["import_declaration"] },
];

// Standard tree-sitter tags `definition.<suffix>` → Dextree SymbolKind. Suffixes
// not present here are ignored (a richer tagset is not an error).
const DEFAULT_SYMBOL_KINDS = {
  function: "function",
  method: "method",
  class: "class",
  interface: "interface",
  module: "type",
  type: "type",
  enum: "enum",
  struct: "class",
  constant: "variable",
  variable: "variable",
};

function tagsFor(pkg) {
  const p = resolve(nm, pkg, "queries", "tags.scm");
  if (!existsSync(p)) throw new Error(`No tags.scm for ${pkg} at ${p}`);
  return readFileSync(p, "utf8");
}

function emit({ pkg, languages, imports = [] }) {
  const tags = tagsFor(pkg);
  const constName = pkg.replace(/[^a-z0-9]/gi, "_").toUpperCase();
  const escaped = tags.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  const importsLine = imports.length > 0 ? `  importNodeTypes: ${JSON.stringify(imports)},\n` : "";
  const lines = [
    `// AUTO-GENERATED from ${pkg}/queries/tags.scm — do not edit by hand.`,
    `// Regenerate: pnpm --filter @dextree/core gen:tags`,
    `import type { LanguageProvider, ProviderConfig } from "../types.js";`,
    ``,
    `const TAGS = String.raw\`${escaped}\`;`,
    ``,
    `const CONFIG: ProviderConfig = {`,
    `  symbolKinds: ${JSON.stringify(DEFAULT_SYMBOL_KINDS, null, 2).replace(/\n/g, "\n  ")},`,
    `  callCaptures: ["reference.call"],`,
    importsLine ? importsLine.replace(/\n$/, "") : null,
    `};`,
  ].filter((l) => l !== null);
  lines.push(
    ``,
    `export const ${constName}_PROVIDERS: readonly LanguageProvider[] = [`,
    ...languages.map(
      (l) => `  { language: ${JSON.stringify(l)}, tagsQuery: TAGS, config: CONFIG },`,
    ),
    `];`,
    ``,
  );
  const out = resolve(outDir, `${pkg}.ts`);
  writeFileSync(out, lines.join("\n"), "utf8");
  return { pkg, constName, file: `${pkg}.ts`, languages };
}

const emitted = LANGUAGES.map(emit);

// Emit the barrel that the registry imports.
const indexLines = [
  `// AUTO-GENERATED — do not edit by hand. Regenerate: pnpm --filter @dextree/core gen:tags`,
  `import type { LanguageProvider } from "../types.js";`,
  ...emitted.map((e) => `import { ${e.constName}_PROVIDERS } from "./${e.pkg}.js";`),
  ``,
  `export const GENERATED_PROVIDERS: readonly LanguageProvider[] = [`,
  ...emitted.map((e) => `  ...${e.constName}_PROVIDERS,`),
  `];`,
  ``,
];
writeFileSync(resolve(outDir, "index.ts"), indexLines.join("\n"), "utf8");

console.log(
  `Generated ${emitted.length} provider modules: ${emitted.map((e) => e.languages.join("/")).join(", ")}`,
);
