import { BaselineTsJsExtractor } from "./BaselineTsJsExtractor.js";
import { ClassRelationExtractor } from "./ClassRelationExtractor.js";
import { DecoratorExtractor } from "./DecoratorExtractor.js";
import { ImplementsExtractor } from "./ImplementsExtractor.js";
import { NaiveCallExtractor } from "./NaiveCallExtractor.js";
import { createExtractorRegistry } from "./registry.js";
import type { ExtractorRegistry } from "./types.js";
import type { Logger } from "../types.js";

/**
 * Builds the default registry with all first-party extractors registered in the
 * order the pipeline depends on:
 *   1. BaselineTsJsExtractor  — claims `file`, produces `symbols` + `imports`.
 *   2. NaiveCallExtractor     — adds `kind = 'CALLS'` rows (pass-1 naive AST walk).
 *   3. ClassRelationExtractor — adds `kind = 'INHERITS'` and `kind = 'INSTANTIATES'` rows.
 *   4. ImplementsExtractor    — adds `kind = 'IMPLEMENTS'` rows (slice 031).
 *   5. DecoratorExtractor     — populates annotation table (slice 031).
 *
 * Tests that want isolation should call `createExtractorRegistry()` directly and
 * register only what they need.
 */
export function createDefaultExtractorRegistry(logger?: Logger): ExtractorRegistry {
  const registry = createExtractorRegistry(logger);
  registry.register(new BaselineTsJsExtractor());
  registry.register(new NaiveCallExtractor());
  registry.register(new ClassRelationExtractor());
  registry.register(new ImplementsExtractor());
  registry.register(new DecoratorExtractor());
  return registry;
}

export { createExtractorRegistry } from "./registry.js";
export { BaselineTsJsExtractor, buildBaselineFileRecord } from "./BaselineTsJsExtractor.js";
export { NaiveCallExtractor } from "./NaiveCallExtractor.js";
export { ClassRelationExtractor } from "./ClassRelationExtractor.js";
export { ImplementsExtractor } from "./ImplementsExtractor.js";
export { DecoratorExtractor } from "./DecoratorExtractor.js";
export type {
  Extractor,
  ExtractorRegistry,
  ExtractInput,
  ExtractionResult,
  EdgeRow,
} from "./types.js";
