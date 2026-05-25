import type { ArchitecturalLayer, EntryKind } from "../../../types.js";
import type { ClassifySymbolInput } from "../classifySymbol.js";

/**
 * One curated classification case. Authors set `input` to a synthetic symbol
 * descriptor and pin the expected `entryKind` / `archLayer` outcome. The test
 * suite drives a single classifier call per sample and asserts both fields.
 */
export interface EntryLayerSample {
  readonly name: string;
  readonly input: ClassifySymbolInput;
  readonly expectedEntryKind: EntryKind;
  readonly expectedArchLayer: ArchitecturalLayer;
}

function makeInput(overrides: Partial<ClassifySymbolInput>): ClassifySymbolInput {
  return {
    relativePath: "src/example.ts",
    language: "typescript",
    symbolKind: "function",
    symbolName: "example",
    source: "function example() {}",
    ...overrides,
  };
}

/**
 * Curated structural samples. Architectural-layer expectations stay at
 * `unknown` until the US2 layer heuristics land; this file already pins the
 * shape so adding layer cases later is purely additive.
 */
export const entryLayerSamples: ReadonlyArray<EntryLayerSample> = [
  // ── test ────────────────────────────────────────────────────────────────
  {
    name: "co-located .test.ts file -> test",
    input: makeInput({
      relativePath: "src/foo.test.ts",
      symbolName: "describesFoo",
      source: "describe('foo', () => {})",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "unknown",
  },
  {
    name: "co-located .spec.tsx file -> test",
    input: makeInput({
      relativePath: "src/components/Button.spec.tsx",
      symbolName: "renderButton",
      source: "it('renders', () => {})",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "unknown",
  },
  {
    name: "file under __tests__/ directory -> test",
    input: makeInput({
      relativePath: "packages/core/__tests__/helpers.ts",
      symbolName: "makeFixture",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "unknown",
  },
  // ── handler ─────────────────────────────────────────────────────────────
  {
    name: "function named handleClick -> handler",
    input: makeInput({
      relativePath: "src/components/Button.tsx",
      symbolKind: "function",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  {
    name: "function named onSubmit -> handler",
    input: makeInput({
      relativePath: "src/components/Form.tsx",
      symbolKind: "function",
      symbolName: "onSubmit",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  {
    name: "class-suffix MessageHandler -> handler",
    input: makeInput({
      relativePath: "src/messaging/dispatch.ts",
      symbolKind: "function",
      symbolName: "MessageHandler",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  {
    name: "function under routes/ directory -> handler",
    input: makeInput({
      relativePath: "src/server/routes/users.ts",
      symbolKind: "function",
      symbolName: "listUsers",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  {
    name: "non-function symbol named handleClick stays unclassified",
    input: makeInput({
      relativePath: "src/components/Button.tsx",
      symbolKind: "variable",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── runtime ─────────────────────────────────────────────────────────────
  {
    name: "main symbol in main.ts -> runtime",
    input: makeInput({
      relativePath: "packages/cli/src/main.ts",
      symbolName: "main",
      source: "export async function main() {}",
    }),
    expectedEntryKind: "runtime",
    expectedArchLayer: "unknown",
  },
  {
    name: "activate symbol in extension.ts -> runtime",
    input: makeInput({
      relativePath: "packages/extension/src/extension.ts",
      symbolName: "activate",
      source: "export function activate(context) {}",
    }),
    expectedEntryKind: "runtime",
    expectedArchLayer: "unknown",
  },
  {
    name: "non-entry symbol in main.ts stays unclassified",
    input: makeInput({
      relativePath: "packages/cli/src/main.ts",
      symbolName: "helper",
      source: "function helper() {}",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── public-api ──────────────────────────────────────────────────────────
  {
    name: "exported function in src/index.ts -> public-api",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "createIndexer",
      source: "export function createIndexer() {}",
    }),
    expectedEntryKind: "public-api",
    expectedArchLayer: "unknown",
  },
  {
    name: "re-exported symbol in src/index.ts -> public-api",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "Indexer",
      source: "export { Indexer } from './types.js';",
    }),
    expectedEntryKind: "public-api",
    expectedArchLayer: "unknown",
  },
  {
    name: "non-exported symbol in src/index.ts stays unclassified",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "internalHelper",
      source: "function internalHelper() {}",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── precedence ─────────────────────────────────────────────────────────
  {
    name: "test file wins over handler name (test > handler)",
    input: makeInput({
      relativePath: "src/components/Button.test.tsx",
      symbolKind: "function",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "unknown",
  },
  {
    name: "handler name wins over runtime filename (handler > runtime)",
    input: makeInput({
      relativePath: "packages/server/src/main.ts",
      symbolKind: "function",
      symbolName: "onRequest",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  // ── unclassified ───────────────────────────────────────────────────────
  {
    name: "ordinary helper in ordinary file -> unclassified",
    input: makeInput({
      relativePath: "packages/core/src/helpers/format.ts",
      symbolKind: "function",
      symbolName: "formatLabel",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
];
