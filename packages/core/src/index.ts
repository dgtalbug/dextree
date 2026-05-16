import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { extractTypeScriptFile } from "./parser/extractor.js";
import { getSymbolsForFile } from "./query/symbols.js";
import { openDatabase, type DatabaseHandle } from "./storage/db.js";
import { replaceFileGraph } from "./storage/repository.js";
import { initializeSchema } from "./storage/schema.js";
import type { IndexResult, Indexer, StoredSymbol } from "./types.js";

export type {
  ExtractedFileRecord,
  ExtractedIndexData,
  FileRecord,
  IndexResult,
  Indexer,
  StoredSymbol,
  SymbolKind,
  SymbolRange,
} from "./types.js";

class DuckTreeIndexer implements Indexer {
  private databaseHandle: DatabaseHandle | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly wasmDir: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.initializationPromise !== null) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      if (this.dbPath !== ":memory:") {
        await mkdir(dirname(this.dbPath), { recursive: true });
      }

      this.databaseHandle = await openDatabase(this.dbPath);
      await initializeSchema(this.databaseHandle.connection);
    })();

    await this.initializationPromise;
  }

  async indexFile(absolutePath: string, workspaceRoot: string): Promise<IndexResult> {
    const startedAt = Date.now();
    await this.initialize();

    const database = this.requireDatabaseHandle();
    const extracted = await extractTypeScriptFile(absolutePath, workspaceRoot, this.wasmDir);

    await replaceFileGraph(database.connection, extracted);

    const symbols = await getSymbolsForFile(database.connection, extracted.file.relativePath);

    return {
      relativePath: extracted.file.relativePath,
      symbolCount: symbols.length,
      symbols,
      elapsedMs: Date.now() - startedAt,
    };
  }

  async getSymbols(relativePath: string): Promise<StoredSymbol[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getSymbolsForFile(database.connection, relativePath);
  }

  async dispose(): Promise<void> {
    if (this.databaseHandle !== null) {
      this.databaseHandle.close();
      this.databaseHandle = null;
    }

    this.initializationPromise = null;
  }

  private requireDatabaseHandle(): DatabaseHandle {
    if (this.databaseHandle === null) {
      throw new Error("Indexer has not been initialized");
    }

    return this.databaseHandle;
  }
}

export function createIndexer(dbPath: string, wasmDir: string): Indexer {
  return new DuckTreeIndexer(dbPath, wasmDir);
}
