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

/**
 * Classify a symbol into an `EntryKind` and `ArchitecturalLayer`.
 *
 * Conservative by design: returns `unclassified` / `unknown` whenever the
 * available heuristics cannot decide safely. Stable precedence (rather than
 * scoring) keeps results from oscillating across reindexes.
 *
 * Heuristic bodies land with US1 (entry kinds) and US2 (architectural layers).
 * Until then this helper deliberately returns the safe fallback so callers
 * can wire it into the indexer without behavior changes.
 */
export function classifySymbol(_input: ClassifySymbolInput): SymbolClassificationRecord {
  return {
    entryKind: UNCLASSIFIED_ENTRY,
    archLayer: UNKNOWN_LAYER,
  };
}
