import { resolve } from "node:path";
import type { Language, Parser, Tree } from "web-tree-sitter";

/**
 * Grammar registry — loads any registered tree-sitter grammar by language name,
 * generalizing the former TypeScript-only loader. A grammar is pure data: a
 * directory + wasm filename under `wasmDir`, mirroring the build's asset layout
 * (`wasmDir/<dir>/<wasm>`). Adding a language is a registry entry, not engine code.
 */
export interface GrammarAsset {
  /** Language name as produced by `detectLanguage` (e.g. "typescript"). */
  readonly language: string;
  /** Directory under `wasmDir` the build copies this grammar into. */
  readonly dir: string;
  /** Wasm filename within that directory. */
  readonly wasm: string;
}

/**
 * Registered grammar assets, keyed by language. The runtime wasm files are
 * produced by the build's asset-copy step (see `packages/extension/esbuild.mjs`).
 * tsx/jsx reuse the typescript/javascript grammars respectively.
 */
const GRAMMARS: Readonly<Record<string, GrammarAsset>> = {
  typescript: {
    language: "typescript",
    dir: "tree-sitter-typescript",
    wasm: "tree-sitter-typescript.wasm",
  },
  typescriptreact: {
    language: "typescriptreact",
    dir: "tree-sitter-typescript",
    wasm: "tree-sitter-tsx.wasm",
  },
  javascript: {
    language: "javascript",
    dir: "tree-sitter-javascript",
    wasm: "tree-sitter-javascript.wasm",
  },
  javascriptreact: {
    language: "javascriptreact",
    dir: "tree-sitter-javascript",
    wasm: "tree-sitter-javascript.wasm",
  },
};

export function getGrammarAsset(language: string): GrammarAsset | undefined {
  return GRAMMARS[language];
}

export function hasGrammar(language: string): boolean {
  return language in GRAMMARS;
}

export const TREE_SITTER_WASM = "tree-sitter.wasm";

let parserRuntimePromise: Promise<void> | undefined;
const languageCache = new Map<string, Promise<Language>>();

export async function initializeParserRuntime(wasmDir: string): Promise<void> {
  if (parserRuntimePromise === undefined) {
    parserRuntimePromise = import("web-tree-sitter").then(({ Parser }) =>
      Parser.init({
        locateFile(scriptName: string) {
          return resolve(wasmDir, "web-tree-sitter", scriptName);
        },
      }),
    );
  }

  await parserRuntimePromise;
}

/**
 * Load (and cache) the tree-sitter Language for a registered grammar. Cache key
 * is `wasmDir + language` so different workspaces / languages don't collide.
 */
export async function loadGrammar(language: string, wasmDir: string): Promise<Language> {
  const asset = getGrammarAsset(language);
  if (asset === undefined) {
    throw new Error(`No tree-sitter grammar registered for language '${language}'`);
  }

  const cacheKey = `${resolve(wasmDir)}::${language}`;
  let languagePromise = languageCache.get(cacheKey);

  if (languagePromise === undefined) {
    languagePromise = (async () => {
      await initializeParserRuntime(wasmDir);
      const { Language } = await import("web-tree-sitter");
      return Language.load(resolve(wasmDir, asset.dir, asset.wasm));
    })();

    languageCache.set(cacheKey, languagePromise);
  }

  return languagePromise;
}

export async function createParser(language: string, wasmDir: string): Promise<Parser> {
  await initializeParserRuntime(wasmDir);
  const { Parser } = await import("web-tree-sitter");
  const parser = new Parser();
  parser.setLanguage(await loadGrammar(language, wasmDir));
  return parser;
}

/**
 * Parse source for any registered language. Returns null when no grammar is
 * registered (structural-only / plaintext files) so the caller can fall back to
 * a file-only record without branching on a hardcoded language set.
 */
export async function parseSource(
  source: string,
  language: string,
  wasmDir: string,
): Promise<Tree | null> {
  if (!hasGrammar(language)) {
    return null;
  }

  const parser = await createParser(language, wasmDir);
  try {
    const tree = parser.parse(source);
    if (tree === null) {
      throw new Error(`Tree-sitter could not parse source for language '${language}'`);
    }
    return tree;
  } finally {
    parser.delete();
  }
}
