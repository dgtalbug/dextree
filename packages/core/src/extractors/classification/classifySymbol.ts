import type {
  ArchitecturalLayer,
  EntryKind,
  FrameworkInfo,
  SymbolClassificationRecord,
} from "../../types.js";

/**
 * Local structural inputs available to the classifier during pass 1 indexing.
 * Everything here is already in memory in the indexer; the classifier must
 * never reach out to the filesystem, the network, or a semantic enrichment
 * pass — those would defeat the pass-1 usefulness guarantee.
 */
export interface ClassifySymbolInput {
  readonly relativePath: string;
  readonly language: string;
  readonly symbolKind: string;
  readonly symbolName: string;
  readonly source: string;
  readonly framework?: FrameworkInfo;
}

const UNCLASSIFIED_ENTRY: EntryKind = "unclassified";
const UNKNOWN_LAYER: ArchitecturalLayer = "unknown";

const TEST_PATH_RX = /(?:^|\/)(?:__tests__|__test__|tests?)\/|\.(?:test|spec)\.[mc]?[jt]sx?$/;

const HANDLER_NAME_RX = /^(?:handle|on)[A-Z0-9]\w*$|^[A-Za-z_]\w*Handler$/;
const HANDLER_PATH_RX = /(?:^|\/)(?:routes?|handlers?|api|controllers?|webhooks?)\//;

const RUNTIME_FILE_RX = /(?:^|\/)(?:main|bootstrap|server|cli|extension|app)\.[mc]?[jt]sx?$/;
const RUNTIME_NAME_SET = new Set(["main", "bootstrap", "start", "activate", "deactivate", "run"]);

const PUBLIC_API_FILE_RX = /(?:^|\/)index\.[mc]?[jt]sx?$/;
const FUNCTION_LIKE_KINDS = new Set(["function", "method"]);

function isTestPath(relativePath: string): boolean {
  return TEST_PATH_RX.test(relativePath);
}

function isHandler(input: ClassifySymbolInput): boolean {
  if (!FUNCTION_LIKE_KINDS.has(input.symbolKind)) {
    return false;
  }
  if (HANDLER_NAME_RX.test(input.symbolName)) {
    return true;
  }
  return HANDLER_PATH_RX.test(input.relativePath);
}

function isRuntime(input: ClassifySymbolInput): boolean {
  if (!RUNTIME_FILE_RX.test(input.relativePath)) {
    return false;
  }
  return RUNTIME_NAME_SET.has(input.symbolName);
}

function isPublicApi(input: ClassifySymbolInput): boolean {
  if (!PUBLIC_API_FILE_RX.test(input.relativePath)) {
    return false;
  }
  return isSymbolExported(input.source, input.symbolName);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function isSymbolExported(source: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  // Declaration export: export [default] [async] (function|class|const|let|var|interface|type|enum) NAME
  const declRx = new RegExp(
    `\\bexport\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var|interface|type|enum)\\s+${escaped}\\b`,
  );
  if (declRx.test(source)) {
    return true;
  }
  // Re-export list: export { ..., NAME, ... } or export { NAME as alias }
  const listRx = new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`);
  return listRx.test(source);
}

function classifyEntryKind(input: ClassifySymbolInput): EntryKind {
  // Precedence (per data model): test > handler > runtime > public-api.
  // Stable ordering rather than scoring keeps results from oscillating
  // across reindexes when a symbol matches multiple heuristics.
  if (isTestPath(input.relativePath)) {
    return "test";
  }
  if (isHandler(input)) {
    return "handler";
  }
  if (isRuntime(input)) {
    return "runtime";
  }
  if (isPublicApi(input)) {
    return "public-api";
  }
  return UNCLASSIFIED_ENTRY;
}

/**
 * Classify a symbol into an `EntryKind` and `ArchitecturalLayer`.
 *
 * Conservative by design: returns `unclassified` / `unknown` whenever the
 * available heuristics cannot decide safely. Stable precedence (rather than
 * scoring) keeps results from oscillating across reindexes.
 *
 * US2 architectural-layer heuristics layer on next.
 */
export function classifySymbol(input: ClassifySymbolInput): SymbolClassificationRecord {
  return {
    entryKind: classifyEntryKind(input),
    archLayer: UNKNOWN_LAYER,
  };
}
