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
  // ── entry: test ────────────────────────────────────────────────────────
  {
    name: "co-located .test.ts file -> test entry, test layer",
    input: makeInput({
      relativePath: "src/foo.test.ts",
      symbolName: "describesFoo",
      source: "describe('foo', () => {})",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "test",
  },
  {
    name: "co-located .spec.tsx file -> test entry, test layer",
    input: makeInput({
      relativePath: "src/components/Button.spec.tsx",
      symbolName: "renderButton",
      source: "it('renders', () => {})",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "test",
  },
  {
    name: "file under __tests__/ directory -> test entry, test layer",
    input: makeInput({
      relativePath: "packages/core/__tests__/helpers.ts",
      symbolName: "makeFixture",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "test",
  },
  // ── entry: handler ─────────────────────────────────────────────────────
  {
    name: "function named handleClick in components/ -> handler entry, presentation layer",
    input: makeInput({
      relativePath: "src/components/Button.tsx",
      symbolKind: "function",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "presentation",
  },
  {
    name: "function named onSubmit in components/ -> handler entry, presentation layer",
    input: makeInput({
      relativePath: "src/components/Form.tsx",
      symbolKind: "function",
      symbolName: "onSubmit",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "presentation",
  },
  {
    name: "class-suffix MessageHandler outside known layer dirs -> handler entry, unknown layer",
    input: makeInput({
      relativePath: "src/messaging/dispatch.ts",
      symbolKind: "function",
      symbolName: "MessageHandler",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  {
    name: "function under routes/ -> handler entry, application layer",
    input: makeInput({
      relativePath: "src/server/routes/users.ts",
      symbolKind: "function",
      symbolName: "listUsers",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "application",
  },
  {
    name: "non-function with handler-like name stays unclassified entry, presentation layer",
    input: makeInput({
      relativePath: "src/components/Button.tsx",
      symbolKind: "variable",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "presentation",
  },
  // ── entry: runtime ─────────────────────────────────────────────────────
  {
    name: "main symbol in main.ts -> runtime entry, unknown layer",
    input: makeInput({
      relativePath: "packages/cli/src/main.ts",
      symbolName: "main",
      source: "export async function main() {}",
    }),
    expectedEntryKind: "runtime",
    expectedArchLayer: "unknown",
  },
  {
    name: "activate symbol in extension.ts -> runtime entry, unknown layer",
    input: makeInput({
      relativePath: "packages/extension/src/extension.ts",
      symbolName: "activate",
      source: "export function activate(context) {}",
    }),
    expectedEntryKind: "runtime",
    expectedArchLayer: "unknown",
  },
  {
    name: "non-entry symbol in main.ts stays unclassified, unknown layer",
    input: makeInput({
      relativePath: "packages/cli/src/main.ts",
      symbolName: "helper",
      source: "function helper() {}",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── entry: public-api ──────────────────────────────────────────────────
  {
    name: "exported function in src/index.ts -> public-api entry, unknown layer",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "createIndexer",
      source: "export function createIndexer() {}",
    }),
    expectedEntryKind: "public-api",
    expectedArchLayer: "unknown",
  },
  {
    name: "re-exported symbol in src/index.ts -> public-api entry, unknown layer",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "Indexer",
      source: "export { Indexer } from './types.js';",
    }),
    expectedEntryKind: "public-api",
    expectedArchLayer: "unknown",
  },
  {
    name: "non-exported symbol in src/index.ts stays unclassified, unknown layer",
    input: makeInput({
      relativePath: "packages/core/src/index.ts",
      symbolName: "internalHelper",
      source: "function internalHelper() {}",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── entry precedence ───────────────────────────────────────────────────
  {
    name: "test file wins over handler name (test > handler); layer also test",
    input: makeInput({
      relativePath: "src/components/Button.test.tsx",
      symbolKind: "function",
      symbolName: "handleClick",
    }),
    expectedEntryKind: "test",
    expectedArchLayer: "test",
  },
  {
    name: "handler name wins over runtime filename (handler > runtime); layer unknown",
    input: makeInput({
      relativePath: "packages/server/src/main.ts",
      symbolKind: "function",
      symbolName: "onRequest",
    }),
    expectedEntryKind: "handler",
    expectedArchLayer: "unknown",
  },
  // ── unclassified ──────────────────────────────────────────────────────
  {
    name: "ordinary helper in ordinary file -> unclassified, unknown layer",
    input: makeInput({
      relativePath: "packages/core/src/helpers/format.ts",
      symbolKind: "function",
      symbolName: "formatLabel",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "unknown",
  },
  // ── layer: presentation ────────────────────────────────────────────────
  {
    name: "symbol in pages/ -> presentation layer",
    input: makeInput({
      relativePath: "packages/web/src/pages/Home.tsx",
      symbolName: "Home",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "presentation",
  },
  {
    name: ".jsx file outside known dirs -> presentation layer (extension fallback)",
    input: makeInput({
      relativePath: "packages/legacy/src/widget.jsx",
      symbolName: "Widget",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "presentation",
  },
  {
    name: "symbol in webview/ -> presentation layer",
    input: makeInput({
      relativePath: "packages/extension/src/webview/utils/format.ts",
      symbolName: "formatStatus",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "presentation",
  },
  // ── layer: application ─────────────────────────────────────────────────
  {
    name: "symbol under commands/ -> application layer",
    input: makeInput({
      relativePath: "packages/extension/src/commands/openGraphView.ts",
      symbolName: "openGraphView",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "application",
  },
  {
    name: "symbol under services/ -> application layer",
    input: makeInput({
      relativePath: "packages/web/src/services/userService.ts",
      symbolName: "registerUser",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "application",
  },
  // ── layer: domain ─────────────────────────────────────────────────────
  {
    name: "symbol under domain/ -> domain layer",
    input: makeInput({
      relativePath: "packages/core/src/domain/order.ts",
      symbolName: "Order",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "domain",
  },
  {
    name: "symbol under models/ -> domain layer",
    input: makeInput({
      relativePath: "packages/web/src/models/user.ts",
      symbolName: "User",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "domain",
  },
  // ── layer: infrastructure ─────────────────────────────────────────────
  {
    name: "symbol under storage/ -> infrastructure layer",
    input: makeInput({
      relativePath: "packages/core/src/storage/db.ts",
      symbolName: "openDatabase",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "infrastructure",
  },
  {
    name: "symbol under repository/ -> infrastructure layer",
    input: makeInput({
      relativePath: "packages/web/src/repository/userRepo.ts",
      symbolName: "UserRepository",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "infrastructure",
  },
  // ── layer precedence ──────────────────────────────────────────────────
  {
    name: "presentation wins over application when both segments match",
    input: makeInput({
      relativePath: "packages/web/src/components/services/Card.tsx",
      symbolName: "Card",
    }),
    expectedEntryKind: "unclassified",
    expectedArchLayer: "presentation",
  },
];
