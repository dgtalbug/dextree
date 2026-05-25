import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { v4 as uuidv4 } from "uuid";

import { detectFrameworks } from "./extractors/frameworks/detector.js";
import { createNodeFsIO } from "./extractors/frameworks/fsIO.js";
import { resolveFileFramework } from "./extractors/frameworks/resolveFileFramework.js";
import type { DetectedFramework } from "./extractors/frameworks/types.js";
import { buildBaselineFileRecord, createDefaultExtractorRegistry } from "./extractors/index.js";
import type { ExtractorRegistry } from "./extractors/types.js";
import { detectLanguage } from "./parser/extractor.js";
import { parseTypeScriptSource } from "./parser/parser.js";
import { getAllFilesQuery } from "./query/files.js";
import { getPresentEdgeKinds } from "./query/presentEdgeKinds.js";
import { querySessionSummary } from "./query/sessionSummary.js";
import { getWorkspaceSubgraph } from "./query/subgraph.js";
import { getSymbolsForFile } from "./query/symbols.js";
import { clearAll, clearFile, clearWorkspace } from "./storage/clear.js";
import { openDatabase, type DatabaseHandle } from "./storage/db.js";
import {
  replaceFileGraph,
  replaceWorkspaceFrameworks,
  resolveWorkspaceCrossFileEdges,
  setFileFramework,
} from "./storage/repository.js";
import { applyMigrations } from "./storage/migrations/runner.js";
import { initializeSchema } from "./storage/schema.js";
import { validateWorkspaceCache, writeWorkspaceCacheSnapshot } from "./storage/workspaceCache.js";
import {
  SCHEMA_VERSION,
  type ClearAllSummary,
  type ClearFileSummary,
  type ClearWorkspaceSummary,
  type FrameworkInfo,
  type IndexResult,
  type Indexer,
  type SessionSummary,
  type StoredFile,
  type StoredSymbol,
  type WorkspaceCacheIdentity,
} from "./types.js";

export { EmptyGraphError } from "./types.js";
export type {
  ArchitecturalLayer,
  ClearAllSummary,
  ClearFileSummary,
  ClearWorkspaceSummary,
  EdgeKindCount,
  EntryKind,
  ExtractedFileRecord,
  ExtractedIndexData,
  FileRecord,
  FrameworkDetectionSource,
  FrameworkInfo,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeType,
  IndexResult,
  Indexer,
  SessionSummary,
  StoredFile,
  StoredSymbol,
  SymbolClassificationRecord,
  SymbolKind,
  SymbolRange,
  TopFile,
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
export { createDefaultExtractorRegistry, createExtractorRegistry } from "./extractors/index.js";
export type {
  EdgeRow,
  Extractor,
  ExtractInput,
  ExtractionResult,
  ExtractorRegistry,
  KnownSymbol,
} from "./extractors/types.js";
export { getPresentEdgeKinds } from "./query/presentEdgeKinds.js";
export type { ForeignWorkspaceGraph, WorkspaceIndexSummary } from "./storage/workspaceRegistry.js";
export { readWorkspaceGraph, readWorkspaceIndexSummary } from "./storage/workspaceRegistry.js";

// NOTE: Lens utilities are NOT re-exported here. They're published via the
// `@dextree/core/lenses` subpath export so webview bundlers (Rollup/Vite)
// don't follow the barrel into DuckDB-touching modules. Import them from
// `@dextree/core/lenses` directly.

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

const TS_LIKE_LANGUAGES = new Set([
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
]);

class DuckTreeIndexer implements Indexer {
  private databaseHandle: DatabaseHandle | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly registry: ExtractorRegistry = createDefaultExtractorRegistry();
  private readonly frameworkCache = new Map<string, readonly DetectedFramework[]>();

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

    const language = detectLanguage(absolutePath);
    const source = await readFile(absolutePath, "utf8");
    const fileId = uuidv4();
    const tree = TS_LIKE_LANGUAGES.has(language)
      ? await parseTypeScriptSource(source, this.wasmDir)
      : null;

    try {
      const result = await this.registry.run({
        absolutePath,
        workspaceRoot,
        language,
        source,
        tree,
        fileId,
        knownSymbols: [],
      });

      // Registry contract invariant 6: if no extractor populated `file`, build
      // a minimal `ExtractedFileRecord` from the input so the file row still
      // gets written (e.g. .md / plaintext / new languages without a baseline).
      const file =
        result.file ?? buildBaselineFileRecord(absolutePath, workspaceRoot, source, fileId);
      if (file === null) {
        // Unreachable — buildBaselineFileRecord never returns null. Kept for
        // type narrowing.
        throw new Error("Unable to build file record");
      }

      const extracted = {
        file,
        symbols: [...result.symbols],
        imports: [...result.imports],
      };

      // Extractor-emitted edges other than the baseline's DEFINES / IMPORTS
      // (which `replaceFileGraph` writes itself) flow through `extraEdges`.
      const extraEdges = [...result.edges];

      await replaceFileGraph(database.connection, extracted, extraEdges);

      // Per-file framework attribution (slice 018). Runs against the cached
      // detection list populated by `detectWorkspaceFrameworks` — no work if
      // detection was never invoked or returned nothing.
      const detected = this.frameworkCache.get(workspaceRoot) ?? [];
      if (detected.length > 0) {
        const attribution = resolveFileFramework(extracted.file.relativePath, source, detected);
        await setFileFramework(
          database.connection,
          extracted.file.id,
          attribution?.framework ?? null,
          attribution?.role ?? null,
        );
      }

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
    } finally {
      tree?.delete();
    }
  }

  async detectWorkspaceFrameworks(workspaceRoot: string): Promise<readonly FrameworkInfo[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    const detected = await detectFrameworks(createNodeFsIO(workspaceRoot));
    this.frameworkCache.set(workspaceRoot, detected);
    await replaceWorkspaceFrameworks(
      database.connection,
      detected.map((row) => ({
        frameworkName: row.frameworkName,
        detectionSource: row.detectionSource,
        confidence: row.confidence,
      })),
    );
    return detected.map((row) => ({
      name: row.frameworkName,
      detectionSource: row.detectionSource,
      confidence: row.confidence,
    }));
  }

  async finalizeWorkspace(workspaceRoot: string): Promise<void> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    await resolveWorkspaceCrossFileEdges(database.connection, workspaceRoot);
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

  async getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getPresentEdgeKinds(database.connection, workspaceRoot);
  }

  async getSessionSummary(workspaceRoot: string): Promise<SessionSummary> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return querySessionSummary(database.connection, workspaceRoot);
  }

  async clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceSummary> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    this.frameworkCache.delete(workspaceRoot);
    return clearWorkspace(database.connection, workspaceRoot);
  }

  async clearFile(filePath: string): Promise<ClearFileSummary> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return clearFile(database.connection, filePath);
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
