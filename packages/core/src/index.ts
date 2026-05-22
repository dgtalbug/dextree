import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { detectLanguage, extractPlainFile, extractTypeScriptFile } from "./parser/extractor.js";
import { getAllFilesQuery } from "./query/files.js";
import { getWorkspaceSubgraph } from "./query/subgraph.js";
import { getSymbolsForFile } from "./query/symbols.js";
import { clearAll, clearWorkspace } from "./storage/clear.js";
import { openDatabase, type DatabaseHandle } from "./storage/db.js";
import { replaceFileGraph } from "./storage/repository.js";
import { applyMigrations } from "./storage/migrations/runner.js";
import { initializeSchema } from "./storage/schema.js";
import { validateWorkspaceCache, writeWorkspaceCacheSnapshot } from "./storage/workspaceCache.js";
import {
  SCHEMA_VERSION,
  type ClearAllSummary,
  type ClearWorkspaceSummary,
  type IndexResult,
  type Indexer,
  type StoredFile,
  type StoredSymbol,
  type WorkspaceCacheIdentity,
} from "./types.js";

export type {
  ClearAllSummary,
  ClearWorkspaceSummary,
  ExtractedFileRecord,
  ExtractedIndexData,
  FileRecord,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeType,
  IndexResult,
  Indexer,
  StoredFile,
  StoredSymbol,
  SymbolKind,
  SymbolRange,
  WorkspaceCacheIdentity,
  WorkspaceCacheInvalidReason,
  WorkspaceCacheLoadResult,
  WorkspaceCacheMetadata,
  WorkspaceCacheStatus,
  WorkspaceCacheValidation,
  WorkspaceSubgraph,
} from "./types.js";

export { createWorkspaceIgnore, type WorkspaceIgnore } from "./ignore/workspaceIgnore.js";
export { recomputeGraphHealth } from "./quality/index.js";

/**
 * Thrown by `DuckTreeIndexer.initialize` when the persisted schema cannot be
 * migrated to the current `SCHEMA_VERSION`. The extension activation path catches
 * this and surfaces a recovery prompt; callers should NOT treat it as a generic
 * Error because the user-facing remediation (clear workspace index + reindex) is
 * specific to schema failures.
 */
export class SchemaError extends Error {
  constructor(reason: string) {
    super(`Dextree schema migration failed: ${reason}`);
    this.name = "SchemaError";
  }
}

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
      const migrationResult = await applyMigrations(this.databaseHandle.connection);
      if (migrationResult.status === "failed") {
        throw new SchemaError(migrationResult.reason);
      }
    })();

    await this.initializationPromise;
  }

  async indexFile(
    absolutePath: string,
    workspaceRoot: string,
    cacheIdentity?: WorkspaceCacheIdentity,
  ): Promise<IndexResult> {
    const startedAt = Date.now();
    await this.initialize();

    const database = this.requireDatabaseHandle();

    const TS_LIKE = new Set(["typescript", "javascript", "typescriptreact", "javascriptreact"]);
    const language = detectLanguage(absolutePath);
    const extracted = TS_LIKE.has(language)
      ? await extractTypeScriptFile(absolutePath, workspaceRoot, this.wasmDir)
      : await extractPlainFile(absolutePath, workspaceRoot);

    await replaceFileGraph(database.connection, extracted);

    const files = await getAllFilesQuery(database.connection);
    const graph = await getWorkspaceSubgraph(database.connection, workspaceRoot);

    await writeWorkspaceCacheSnapshot(database.connection, {
      identity: cacheIdentity ?? {
        cacheKey: workspaceRoot,
        workspaceRoot,
        repoRoot: null,
        repoRemote: null,
      },
      schemaVersion: SCHEMA_VERSION,
      indexedFileCount: files.length,
      graphNodeCount: graph.nodes.length,
      graphEdgeCount: graph.edges.length,
    });

    const symbols = await getSymbolsForFile(database.connection, extracted.file.relativePath);

    return {
      relativePath: extracted.file.relativePath,
      symbolCount: symbols.length,
      symbols,
      elapsedMs: Date.now() - startedAt,
    };
  }

  async validateWorkspaceCache(identity: WorkspaceCacheIdentity) {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return validateWorkspaceCache(database.connection, identity);
  }

  async getSymbols(relativePath: string): Promise<StoredSymbol[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getSymbolsForFile(database.connection, relativePath);
  }

  async getAllFiles(): Promise<StoredFile[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getAllFilesQuery(database.connection);
  }

  async getWorkspaceSubgraph(workspaceRoot: string) {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getWorkspaceSubgraph(database.connection, workspaceRoot);
  }

  async clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceSummary> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return clearWorkspace(database.connection, workspaceRoot);
  }

  async clearAll(): Promise<ClearAllSummary> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return clearAll(database.connection);
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
