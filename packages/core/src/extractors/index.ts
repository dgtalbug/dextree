import { BaselineTsJsExtractor } from "./BaselineTsJsExtractor.js";
import { ClassRelationExtractor } from "./ClassRelationExtractor.js";
import { NaiveCallExtractor } from "./NaiveCallExtractor.js";
import { createExtractorRegistry } from "./registry.js";
import type { ExtractorRegistry } from "./types.js";

/**
 * Builds the default registry with all first-party extractors registered in the
 * order the pipeline depends on:
 *   1. BaselineTsJsExtractor  — claims `file`, produces `symbols` + `imports`.
 *   2. NaiveCallExtractor     — adds `kind = 'CALLS'` rows (pass-1 naive AST walk).
 *   3. ClassRelationExtractor — adds `kind = 'INHERITS'` and `kind = 'INSTANTIATES'` rows.
 *
 * Tests that want isolation should call `createExtractorRegistry()` directly and
 * register only what they need.
 */
export function createDefaultExtractorRegistry(): ExtractorRegistry {
  const registry = createExtractorRegistry();
  registry.register(new BaselineTsJsExtractor());
  registry.register(new NaiveCallExtractor());
  registry.register(new ClassRelationExtractor());
  return registry;
}

export { createExtractorRegistry } from "./registry.js";
export { BaselineTsJsExtractor, buildBaselineFileRecord } from "./BaselineTsJsExtractor.js";
export { NaiveCallExtractor } from "./NaiveCallExtractor.js";
export { ClassRelationExtractor } from "./ClassRelationExtractor.js";
export type {
  Extractor,
  ExtractorRegistry,
  ExtractInput,
  ExtractionResult,
  EdgeRow,
} from "./types.js";
