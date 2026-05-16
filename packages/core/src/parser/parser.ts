import { resolve } from "node:path";
import { Language, Parser, type Tree } from "web-tree-sitter";

export const TREE_SITTER_WASM = "tree-sitter.wasm";
export const TREE_SITTER_TYPESCRIPT_WASM = "tree-sitter-typescript.wasm";

let parserRuntimePromise: Promise<void> | undefined;
const languageCache = new Map<string, Promise<Language>>();

export async function initializeParserRuntime(wasmDir: string): Promise<void> {
  parserRuntimePromise ??= Parser.init({
    locateFile(scriptName: string) {
      return resolve(wasmDir, "web-tree-sitter", scriptName);
    },
  });

  await parserRuntimePromise;
}

export async function loadTypeScriptLanguage(wasmDir: string): Promise<Language> {
  const cacheKey = resolve(wasmDir);
  let languagePromise = languageCache.get(cacheKey);

  if (languagePromise === undefined) {
    languagePromise = (async () => {
      await initializeParserRuntime(wasmDir);
      return Language.load(resolve(wasmDir, "tree-sitter-typescript", TREE_SITTER_TYPESCRIPT_WASM));
    })();

    languageCache.set(cacheKey, languagePromise);
  }

  return languagePromise;
}

export async function createTypeScriptParser(wasmDir: string): Promise<Parser> {
  await initializeParserRuntime(wasmDir);

  const parser = new Parser();
  parser.setLanguage(await loadTypeScriptLanguage(wasmDir));
  return parser;
}

export async function parseTypeScriptSource(source: string, wasmDir: string): Promise<Tree> {
  const parser = await createTypeScriptParser(wasmDir);

  try {
    const tree = parser.parse(source);

    if (tree === null) {
      throw new Error("Tree-sitter could not parse the provided TypeScript source");
    }

    return tree;
  } finally {
    parser.delete();
  }
}
