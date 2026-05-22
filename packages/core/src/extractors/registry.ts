import type { ExtractedImportRef, StoredSymbol } from "../types.js";
import type {
  EdgeRow,
  Extractor,
  ExtractInput,
  ExtractionResult,
  ExtractorRegistry,
} from "./types.js";

class InMemoryExtractorRegistry implements ExtractorRegistry {
  private readonly extractors: Extractor[] = [];

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

    for (const extractor of matching) {
      let result: ExtractionResult;
      try {
        result = await extractor.extract(input);
      } catch (error) {
        // Per FR-007 / contract: failure isolation. Log and continue.
        console.warn({
          extractor: extractor.name,
          version: extractor.version,
          file: input.absolutePath,
          error,
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
    }

    return { file, symbols, imports, edges, annotations, modules, tests };
  }
}

export function createExtractorRegistry(): ExtractorRegistry {
  return new InMemoryExtractorRegistry();
}

export type { Extractor, ExtractorRegistry } from "./types.js";
