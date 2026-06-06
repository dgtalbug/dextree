import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { v4 as uuidv4 } from "uuid";

import { classifySymbol } from "./extractors/classification/classifySymbol.js";
import { detectFrameworks } from "./extractors/frameworks/detector.js";
import { createNodeFsIO } from "./extractors/frameworks/fsIO.js";
import { resolveFileFramework } from "./extractors/frameworks/resolveFileFramework.js";
import type { DetectedFramework } from "./extractors/frameworks/types.js";
import { buildBaselineFileRecord, createDefaultExtractorRegistry } from "./extractors/index.js";
import type { ExtractorRegistry } from "./extractors/types.js";
import { detectLanguage } from "./parser/extractor.js";
import { parseSource } from "./parser/grammars.js";
import { getCoverageReport } from "./query/coverage.js";
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
  type CoverageReport,
  type FrameworkInfo,
  type IndexResult,
  type Indexer,
  type IndexerFactoryOptions,
  type Logger,
  type SessionSummary,
  type StoredFile,
  type StoredSymbol,
  type SymbolClassificationRecord,
  type WorkspaceCacheIdentity,
} from "./types.js";

export { EmptyGraphError } from "./types.js";
export type {
  ArchitecturalLayer,
  ClearAllSummary,
  ClearFileSummary,
  ClearWorkspaceSummary,
  CoverageReport,
  CoverageRow,
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
  IndexerFactoryOptions,
  IndexResult,
  Indexer,
  Logger,
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

export {
  createWorkspaceIgnore,
  type WorkspaceIgnore,
  type WorkspaceIgnoreOptions,
} from "./ignore/workspaceIgnore.js";
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
export { getCoverageReport } from "./query/coverage.js";
export type { CallResolver, ResolvedEdge, ResolutionTier } from "./resolution/types.js";
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

class DuckTreeIndexer implements Indexer {
  private databaseHandle: DatabaseHandle | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly registry: ExtractorRegistry;
  private readonly frameworkCache = new Map<string, readonly DetectedFramework[]>();
  private readonly logger: Logger | undefined;
  private readonly indexFileInFlight = new Map<string, Promise<IndexResult>>();

  constructor(
    private readonly dbPath: string,
    private readonly wasmDir: string,
    options?: IndexerFactoryOptions,
  ) {
    this.logger = options?.logger;
    this.registry = createDefaultExtractorRegistry(this.wasmDir, this.logger);
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise !== null) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      this.logger?.debug("Initializing DuckDB", { dbPath: this.dbPath });

      if (this.dbPath !== ":memory:") {
        await mkdir(dirname(this.dbPath), { recursive: true });
      }

      this.databaseHandle = await openDatabase(this.dbPath);
      await initializeSchema(this.databaseHandle.connection);
      const migrationResult = await applyMigrations(this.databaseHandle.connection, this.logger);
      if (migrationResult.status === "failed") {
        throw new SchemaError(migrationResult.reason);
      }

      this.logger?.debug("Initialized DuckDB", { dbPath: this.dbPath });
    })();

    await this.initializationPromise;
  }

  async indexFile(
    absolutePath: string,
    workspaceRoot: string,
    cacheIdentity?: WorkspaceCacheIdentity,
  ): Promise<IndexResult> {
    const existing = this.indexFileInFlight.get(absolutePath);
    if (existing !== undefined) {
      return existing;
    }

    const promise = this.doIndexFile(absolutePath, workspaceRoot, cacheIdentity);
    this.indexFileInFlight.set(absolutePath, promise);
    try {
      return await promise;
    } finally {
      this.indexFileInFlight.delete(absolutePath);
    }
  }

  private async doIndexFile(
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
    // Generic parse: any language with a registered grammar gets a tree; others
    // (structural/plaintext) get null and fall through to the file-only record.
    const tree = await parseSource(source, language, this.wasmDir);

    try {
      this.logger?.debug("indexFile start", {
        relativePath: absolutePath.split("/").pop() ?? absolutePath,
      });

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

      // Per-file framework attribution (slice 018) is needed before classification
      // so the classifier can use it as one of its local structural inputs.
      const detected = this.frameworkCache.get(workspaceRoot) ?? [];
      const attribution =
        detected.length > 0
          ? resolveFileFramework(extracted.file.relativePath, source, detected)
          : null;
      const detectedHit = attribution
        ? (detected.find((f) => f.frameworkName === attribution.framework) ?? null)
        : null;
      const frameworkInfo: FrameworkInfo | undefined = detectedHit
        ? {
            name: detectedHit.frameworkName,
            detectionSource: detectedHit.detectionSource,
            confidence: detectedHit.confidence,
          }
        : undefined;

      const classifications = new Map<string, SymbolClassificationRecord>();
      for (const symbol of extracted.symbols) {
        classifications.set(
          symbol.id,
          classifySymbol({
            relativePath: extracted.file.relativePath,
            language: symbol.language,
            symbolKind: symbol.kind,
            symbolName: symbol.name,
            source,
            ...(frameworkInfo === undefined ? {} : { framework: frameworkInfo }),
          }),
        );
      }

      await replaceFileGraph(
        database.connection,
        extracted,
        extraEdges,
        classifications,
        result.annotations ?? [],
      );

      if (detected.length > 0) {
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

      const elapsedMs = Date.now() - startedAt;
      this.logger?.debug("indexFile complete", {
        relativePath: extracted.file.relativePath,
        symbolCount: symbols.length,
        elapsedMs,
      });

      return {
        relativePath: extracted.file.relativePath,
        symbolCount: symbols.length,
        symbols,
        elapsedMs,
      };
    } finally {
      tree?.delete();
    }
  }

  async detectWorkspaceFrameworks(workspaceRoot: string): Promise<readonly FrameworkInfo[]> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    const detected = await detectFrameworks(createNodeFsIO(workspaceRoot, this.logger));
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
    this.logger?.info("Finalized workspace cross-file edges", { workspaceRoot });
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

  async getCoverageReport(): Promise<CoverageReport> {
    await this.initialize();
    const database = this.requireDatabaseHandle();
    return getCoverageReport(database.connection);
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

export function createIndexer(
  dbPath: string,
  wasmDir: string,
  options?: IndexerFactoryOptions,
): Indexer {
  return new DuckTreeIndexer(dbPath, wasmDir, options);
}
