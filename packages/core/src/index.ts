import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

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
import type { NeighborhoodOptions, NeighborhoodResult } from "./query/neighborhood.js";
import type { PreciseLocationResolver, PreciseResolution } from "./resolution/types.js";
import { openDatabase } from "./storage/db.js";
import { DuckDbGraphRepository } from "./storage/adapters/duckdbGraphRepository.js";
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
  type PreciseResolutionOptions,
  type PreciseResolutionSummary,
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
  NeighborhoodOptions,
  NeighborhoodResult,
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
  PreciseResolutionOptions,
  PreciseResolutionSummary,
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
export type {
  CallResolver,
  ResolvedEdge,
  ResolutionTier,
  NodeLocation,
  PreciseCallEdge,
  PreciseLocationResolver,
  PreciseResolution,
  UnresolvedCallSite,
} from "./resolution/types.js";
export type { ForeignWorkspaceGraph, WorkspaceIndexSummary } from "./storage/workspaceRegistry.js";
export type { ForeignGraphReader, GraphRepository } from "./storage/graphRepository.js";
export { DuckDbForeignGraphReader } from "./storage/adapters/duckdbGraphRepository.js";

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
  private repo: DuckDbGraphRepository | null = null;
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

      const handle = await openDatabase(this.dbPath);
      this.repo = new DuckDbGraphRepository(handle, this.logger);
      await this.repo.initializeSchema();
      const migrationResult = await this.repo.applyMigrations();
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
    // Fail fast at the boundary (RULE-ARCH-006) — an empty/relative path would
    // otherwise surface as an opaque fs error deep in extraction.
    if (!isAbsolute(absolutePath)) {
      throw new Error(`indexFile: absolutePath must be an absolute path, got "${absolutePath}"`);
    }
    if (!isAbsolute(workspaceRoot)) {
      throw new Error(`indexFile: workspaceRoot must be an absolute path, got "${workspaceRoot}"`);
    }

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

    const repo = this.requireRepo();

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

      // Per-file framework attribution is needed before classification
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

      await repo.replaceFileGraph(extracted, extraEdges, classifications, result.annotations ?? []);

      if (detected.length > 0) {
        await repo.setFileFramework(
          extracted.file.id,
          attribution?.framework ?? null,
          attribution?.role ?? null,
        );
      }

      const files = await repo.getAllFiles();
      const graph = await repo.getWorkspaceSubgraph(workspaceRoot);

      await repo.writeWorkspaceCacheSnapshot({
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

      const symbols = await repo.getSymbolsForFile(extracted.file.relativePath);

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
    const repo = this.requireRepo();
    const detected = await detectFrameworks(createNodeFsIO(workspaceRoot, this.logger));
    this.frameworkCache.set(workspaceRoot, detected);
    await repo.replaceWorkspaceFrameworks(
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
    const repo = this.requireRepo();
    await repo.resolveWorkspaceCrossFileEdges(workspaceRoot);
    await repo.synthesizeFolderTree();
    // Stamp tiers again so the just-created CONTAINS edges get a tier too.
    await repo.stampResolutionTier();
    this.logger?.info("Finalized workspace cross-file edges + folder tree", { workspaceRoot });
  }

  async resolvePreciseEdges(
    workspaceRoot: string,
    resolver: PreciseLocationResolver,
    options?: PreciseResolutionOptions,
  ): Promise<PreciseResolutionSummary> {
    await this.initialize();
    const repo = this.requireRepo();

    const sites = await repo.getUnresolvedCallSites(workspaceRoot);
    const resolutions: PreciseResolution[] = [];
    let processed = 0;
    let cancelled = false;

    for (const site of sites) {
      if (options?.isCancelled?.() === true) {
        cancelled = true;
        break;
      }
      // The user's language server answers by location. Take the first returned
      // callee that maps back to a stored symbol; leave the edge heuristic if none.
      const edges = await resolver.resolve(site.sourceLocation, "out");
      for (const edge of edges) {
        const targetId = await repo.findSymbolIdAt(edge.filePath, edge.line);
        if (targetId !== null) {
          resolutions.push({ edgeId: site.edgeId, targetId });
          break;
        }
      }
      processed += 1;
      options?.onProgress?.({ processed, total: sites.length, upgraded: resolutions.length });
    }

    const upgraded = await repo.persistPreciseEdges(resolutions);
    this.logger?.info("Precise resolution pass complete", {
      workspaceRoot,
      total: sites.length,
      upgraded,
      cancelled,
    });
    return { total: sites.length, upgraded, cancelled };
  }

  async neighborhood(nodeId: string, options: NeighborhoodOptions): Promise<NeighborhoodResult> {
    // Fail fast at the boundary (RULE-ARCH-006) — an empty node id would scan
    // from a non-existent seed and silently return nothing.
    if (nodeId.trim() === "") {
      throw new Error("neighborhood: nodeId must be a non-empty string");
    }
    await this.initialize();
    const repo = this.requireRepo();
    return repo.neighborhood(nodeId, options);
  }

  async validateWorkspaceCache(identity: WorkspaceCacheIdentity) {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.validateWorkspaceCache(identity);
  }

  async getSymbols(relativePath: string): Promise<StoredSymbol[]> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getSymbolsForFile(relativePath);
  }

  async getAllFiles(): Promise<StoredFile[]> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getAllFiles();
  }

  async getWorkspaceSubgraph(workspaceRoot: string) {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getWorkspaceSubgraph(workspaceRoot);
  }

  async getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getPresentEdgeKinds(workspaceRoot);
  }

  async getCoverageReport(): Promise<CoverageReport> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getCoverageReport();
  }

  async getSessionSummary(workspaceRoot: string): Promise<SessionSummary> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.getSessionSummary(workspaceRoot);
  }

  async clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceSummary> {
    await this.initialize();
    const repo = this.requireRepo();
    this.frameworkCache.delete(workspaceRoot);
    return repo.clearWorkspace(workspaceRoot);
  }

  async clearFile(filePath: string): Promise<ClearFileSummary> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.clearFile(filePath);
  }

  async clearAll(): Promise<ClearAllSummary> {
    await this.initialize();
    const repo = this.requireRepo();
    return repo.clearAll();
  }

  async dispose(): Promise<void> {
    if (this.repo !== null) {
      this.repo.dispose();
      this.repo = null;
    }

    this.initializationPromise = null;
  }

  private requireRepo(): DuckDbGraphRepository {
    if (this.repo === null) {
      throw new Error("Indexer has not been initialized");
    }

    return this.repo;
  }
}

export function createIndexer(
  dbPath: string,
  wasmDir: string,
  options?: IndexerFactoryOptions,
): Indexer {
  return new DuckTreeIndexer(dbPath, wasmDir, options);
}
