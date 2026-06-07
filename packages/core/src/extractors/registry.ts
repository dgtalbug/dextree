import type { ExtractedImportRef, Logger, StoredSymbol } from "../types.js";
import type {
  EdgeRow,
  Extractor,
  ExtractInput,
  ExtractionResult,
  ExtractorRegistry,
  KnownSymbol,
} from "./types.js";

/** Convert a StoredSymbol to the lightweight KnownSymbol shape. */
function toKnownSymbol(s: StoredSymbol): KnownSymbol {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    // StoredSymbol.range uses 0-based rows (tree-sitter convention from toRange()).
    // Extractors also use 0-based node.startPosition.row — no adjustment needed.
    startLine: s.range.startLine,
    startCol: s.range.startCol,
    endLine: s.range.endLine,
    endCol: s.range.endCol,
  };
}

class InMemoryExtractorRegistry implements ExtractorRegistry {
  private readonly extractors: Extractor[] = [];
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  register(extractor: Extractor): void {
    if (this.extractors.some((existing) => existing.name === extractor.name)) {
      throw new Error(`Extractor '${extractor.name}' is already registered`);
    }
    this.extractors.push(extractor);
  }

  async run(input: ExtractInput): Promise<ExtractionResult> {
    const matching = this.extractors.filter((extractor) => extractor.supports(input.language));

    let file: ExtractionResult["file"] = null;
    let fileOwner: string | null = null;
    const symbols: StoredSymbol[] = [];
    const imports: ExtractedImportRef[] = [];
    const edges: EdgeRow[] = [];
    const annotations: unknown[] = [];
    const modules: unknown[] = [];
    const tests: unknown[] = [];
    // Accumulate known symbols so each extractor sees the IDs the earlier
    // extractors already minted. This lets relational extractors look up the
    // exact symbol IDs that definition extractors wrote instead of minting
    // their own (which would produce dangling foreign keys in the edge table).
    const knownSymbols: KnownSymbol[] = [...(input.knownSymbols ?? [])];

    for (const extractor of matching) {
      const enrichedInput: ExtractInput = { ...input, knownSymbols };
      let result: ExtractionResult;
      try {
        result = await extractor.extract(enrichedInput);
      } catch (err) {
        // Failure isolation: one extractor's error must not abort the rest.
        // Log and continue.
        this.logger?.warn("Extractor failed", {
          extractor: extractor.name,
          file: input.absolutePath,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (result.file !== null) {
        if (file !== null) {
          throw new Error(
            `Multiple extractors populated \`file\`: '${fileOwner}' and '${extractor.name}'`,
          );
        }
        file = result.file;
        fileOwner = extractor.name;
      }

      symbols.push(...result.symbols);
      imports.push(...result.imports);
      edges.push(...result.edges);
      if (result.annotations !== undefined) {
        annotations.push(...result.annotations);
      }
      if (result.modules !== undefined) {
        modules.push(...result.modules);
      }
      if (result.tests !== undefined) {
        tests.push(...result.tests);
      }
      // Forward this extractor's symbols to all subsequent extractors.
      knownSymbols.push(...result.symbols.map(toKnownSymbol));
    }

    return { file, symbols, imports, edges, annotations, modules, tests };
  }
}

export function createExtractorRegistry(logger?: Logger): ExtractorRegistry {
  return new InMemoryExtractorRegistry(logger);
}

export type { Extractor, ExtractorRegistry } from "./types.js";
