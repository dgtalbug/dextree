import { GenericTagsExtractor } from "./GenericTagsExtractor.js";
import { createExtractorRegistry } from "./registry.js";
import type { ExtractorRegistry } from "./types.js";
import type { Logger } from "../types.js";

/**
 * Builds the default registry with the one generic, data-driven extraction
 * engine registered. Per-language behaviour lives in `languages/` providers
 * (grammar + tags.scm + config); the engine never branches on language. This
 * replaced the former five hardcoded TS/JS extractors.
 *
 * `wasmDir` is where the build copies tree-sitter grammar wasm files; the engine
 * loads grammars from there per language.
 *
 * Tests that want isolation should call `createExtractorRegistry()` directly and
 * register only what they need.
 */
export function createDefaultExtractorRegistry(
  wasmDir: string,
  logger?: Logger,
): ExtractorRegistry {
  const registry = createExtractorRegistry(logger);
  registry.register(new GenericTagsExtractor(wasmDir));
  return registry;
}

export { createExtractorRegistry } from "./registry.js";
export { GenericTagsExtractor } from "./GenericTagsExtractor.js";
export { buildBaselineFileRecord } from "./baselineFileRecord.js";
export type {
  Extractor,
  ExtractorRegistry,
  ExtractInput,
  ExtractionResult,
  EdgeRow,
} from "./types.js";
