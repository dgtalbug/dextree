import type { SymbolKind } from "../../types.js";

/**
 * Maps a tree-sitter tags capture vocabulary to Dextree's model. Captures follow
 * the standard tree-sitter `@role.kind` convention (`@definition.function`,
 * `@reference.call`, `@name`); this config says what each `definition.*` kind
 * means and which captures denote calls. Everything here is data — the generic
 * engine reads it and never branches on language.
 */
export interface ProviderConfig {
  /**
   * Tags `definition.<key>` capture suffix → Dextree `SymbolKind`. A definition
   * capture whose suffix is absent here is ignored (e.g. `definition.constant`
   * when we don't model constants), so a richer grammar tagset is not an error.
   */
  readonly symbolKinds: Readonly<Record<string, SymbolKind>>;
  /**
   * Capture names that denote a call reference (typically `["reference.call"]`).
   * The engine emits a `CALLS` edge from the enclosing definition to the callee
   * name for each of these.
   */
  readonly callCaptures: readonly string[];
  /**
   * Structural-only formats (markdown/yaml/json) that have no call graph. When
   * true the engine still records file + definition nodes but fabricates no
   * call edges even if a capture exists.
   */
  readonly structuralOnly?: boolean;
}

/**
 * A language is pure data: the grammar (resolved via the grammar registry by
 * `language`), a tree-sitter `tags.scm` query string (already assembled,
 * including any inherited base query), and the capture→model config. Adding a
 * language = registering one of these. No engine change (RULE-ARCH-009).
 */
export interface LanguageProvider {
  /** Language name as produced by `detectLanguage`. */
  readonly language: string;
  /** Assembled tree-sitter tags query source (base + language additions). */
  readonly tagsQuery: string;
  readonly config: ProviderConfig;
}
