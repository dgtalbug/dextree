import type { Tree } from "web-tree-sitter";

import type { ExtractedFileRecord, ExtractedImportRef, StoredSymbol } from "../types.js";

/**
 * Minimal symbol descriptor forwarded from earlier extractors so that later
 * extractors (e.g. NaiveCallExtractor) can resolve symbol IDs without minting
 * their own. Populated by the registry after each extractor runs.
 */
export interface KnownSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** 0-based start row from tree-sitter (matches `node.startPosition.row`). */
  readonly startLine: number;
  /** 0-based start column from tree-sitter (matches `node.startPosition.column`). */
  readonly startCol: number;
  /** 0-based end row. */
  readonly endLine: number;
  /** 0-based end column. */
  readonly endCol: number;
}

/**
 * Input handed to each extractor by the registry. Read-only by contract; extractors
 * MUST NOT mutate `tree`, `source`, or any other field. `tree` is shared across
 * every extractor invocation for the same file — no extractor re-parses.
 *
 * `fileId` is determined by the indexer before dispatch (re-used from a prior
 * indexing run when the file is already known, freshly minted otherwise) so that
 * every extractor agrees on which file id to use as a foreign-key target.
 *
 * `knownSymbols` is populated by the registry after each extractor finishes, so
 * later extractors see the symbol IDs that the baseline already committed to.
 * It is empty for the first extractor in the chain.
 */
export interface ExtractInput {
  readonly absolutePath: string;
  readonly workspaceRoot: string;
  readonly language: string;
  readonly source: string;
  readonly tree: Tree | null;
  readonly fileId: string;
  /** Symbols accumulated from all previously-run extractors in this chain. */
  readonly knownSymbols: readonly KnownSymbol[];
}

/**
 * In-memory row that maps 1:1 to a row in the `edge` table. Minted by an
 * extractor and persisted by the indexer adapter. `metadata` carries kind-specific
 * keys (e.g. `callee_name`, `call_site_range`, `language` for `CALLS`).
 */
export interface EdgeRow {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind: string;
  readonly weight?: number | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * What each extractor returns. Matches `.dextree/design.md` §8.6 except for the
 * additive `imports` field — slice 009 persists imports as `edge` rows, but the
 * in-memory representation still travels through this typed array on the way to
 * `replaceFileGraph`.
 *
 * `file` is populated by exactly one extractor per run (the baseline). Multiple
 * extractors claiming ownership is a programmer error — the registry throws.
 */
export interface ExtractionResult {
  readonly file: ExtractedFileRecord | null;
  readonly symbols: readonly StoredSymbol[];
  readonly imports: readonly ExtractedImportRef[];
  readonly edges: readonly EdgeRow[];
  readonly annotations?: readonly unknown[];
  readonly modules?: readonly unknown[];
  readonly tests?: readonly unknown[];
}

/**
 * Plugin-style extractor contract. `name` is unique across registrations.
 * `version` is informational and surfaces in `console.warn` failure logs.
 * `supports(language)` is the language filter; `extract(input)` produces rows.
 * Future plugin-loaded extractors will implement the same interface — slice 010
 * keeps the surface internal, so no packaging / sandboxing yet.
 */
export interface Extractor {
  readonly name: string;
  readonly version: string;
  supports(language: string): boolean;
  extract(input: ExtractInput): Promise<ExtractionResult>;
}

/**
 * Dispatches a file through every extractor that matches its language, in
 * registration order. Failure-isolated per extractor per file — one extractor
 * throwing MUST NOT prevent other extractors from contributing rows.
 */
export interface ExtractorRegistry {
  register(extractor: Extractor): void;
  run(input: ExtractInput): Promise<ExtractionResult>;
}
