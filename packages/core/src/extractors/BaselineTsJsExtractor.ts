import { createHash } from "node:crypto";
import { relative, sep } from "node:path";

import { detectLanguage, extractTypeScriptFromTree } from "../parser/extractor.js";
import type { Extractor, ExtractInput, ExtractionResult } from "./types.js";

const SUPPORTED = new Set([
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
]);

function emptyResult(): ExtractionResult {
  return {
    file: null,
    symbols: [],
    imports: [],
    edges: [],
    annotations: [],
    modules: [],
    tests: [],
  };
}

function toPosixRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function getLoc(source: string): number {
  return source.split("\n").length;
}

/**
 * First-party extractor that wraps the pre-slice-010 TS/JS extraction logic and
 * registers itself as the **baseline** — the single owner of the merged
 * `ExtractionResult.file` field. Routed through the shared `input.tree` so
 * subsequent extractors (e.g. NaiveCallExtractor in US2) walk the same AST.
 *
 * For non-supported languages, returns an empty result; the indexer fall-back
 * path constructs a minimal `ExtractedFileRecord` itself per contract invariant 6.
 *
 * Suffix routing:
 *  - `.md` / plaintext go through the empty-result branch (file row only,
 *    created by the indexer fallback).
 *  - `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` (anything `detectLanguage`
 *    maps to one of the SUPPORTED values) goes through the tree walk.
 */
export class BaselineTsJsExtractor implements Extractor {
  readonly name = "baseline-ts-js";
  readonly version = "0.1.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    const extracted = await extractTypeScriptFromTree(
      input.absolutePath,
      input.workspaceRoot,
      input.source,
      input.tree,
      input.fileId,
    );

    return {
      file: extracted.file,
      symbols: extracted.symbols,
      imports: extracted.imports,
      edges: [],
      annotations: [],
      modules: [],
      tests: [],
    };
  }
}

/**
 * Helper for the indexer fallback path — constructs a minimal
 * `ExtractedFileRecord` for files whose language doesn't match any extractor's
 * `supports()`. Mirrors `extractPlainFile` without the file-system read (the
 * indexer already has the source string in memory).
 */
export function buildBaselineFileRecord(
  absolutePath: string,
  workspaceRoot: string,
  source: string,
  fileId: string,
): ExtractionResult["file"] {
  return {
    id: fileId,
    path: absolutePath,
    relativePath: toPosixRelativePath(workspaceRoot, absolutePath),
    language: detectLanguage(absolutePath),
    loc: getLoc(source),
    hash: hashSource(source),
  };
}

