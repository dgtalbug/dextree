import type { EdgeRow } from "../../extractors/types.js";
import type { PreciseResolution } from "../../resolution/types.js";
import type { Logger } from "../../types.js";
import type {
  CoverageReport,
  ExtractedIndexData,
  NeighborhoodOptions,
  NeighborhoodResult,
  SessionSummary,
  StoredFile,
  StoredSymbol,
  SymbolClassificationRecord,
  WorkspaceCacheIdentity,
  WorkspaceCacheValidation,
  WorkspaceSubgraph,
} from "../../types.js";
import { getCoverageReport } from "../../query/coverage.js";
import { getAllFilesQuery } from "../../query/files.js";
import { neighborhood } from "../../query/neighborhood.js";
import { getPresentEdgeKinds } from "../../query/presentEdgeKinds.js";
import { querySessionSummary } from "../../query/sessionSummary.js";
import { getSymbolsForFile } from "../../query/symbols.js";
import { getWorkspaceSubgraph } from "../../query/subgraph.js";
import { clearAll, clearFile, clearWorkspace } from "../clear.js";
import type { ClearAllResult, ClearFileResult, ClearWorkspaceResult } from "../clear.js";
import type { ForeignGraphReader, GraphRepository } from "../graphRepository.js";
import { applyMigrations } from "../migrations/runner.js";
import type { MigrationResult } from "../migrations/runner.js";
import { replaceFileGraph, replaceWorkspaceFrameworks, setFileFramework } from "../repository.js";
import type { DetectedFrameworkRow } from "../repository.js";
import { resolveWorkspaceCrossFileEdges, stampResolutionTier } from "../resolution.js";
import {
  findSymbolIdAt,
  getUnresolvedCallSites,
  persistPreciseEdges,
} from "../preciseResolution.js";
import { synthesizeFolderTree } from "../folderTree.js";
import { initializeSchema } from "../schema.js";
import { writeWorkspaceCacheSnapshot, validateWorkspaceCache } from "../workspaceCache.js";
import type { WriteWorkspaceCacheSnapshotInput } from "../workspaceCache.js";
import {
  readWorkspaceGraph,
  readWorkspaceIndexSummary,
  type ForeignWorkspaceGraph,
  type WorkspaceIndexSummary,
} from "../workspaceRegistry.js";
import type { DatabaseHandle } from "./duckdb.js";

/**
 * DuckDB-backed {@link GraphRepository}. Holds the open {@link DatabaseHandle} and
 * delegates each method to the existing connection-first storage/query functions,
 * supplying the connection itself — so no consumer passes one. This is a thin
 * relocation behind the interface (RULE-ARCH-003): zero behavior change versus
 * calling the functions directly.
 */
export class DuckDbGraphRepository implements GraphRepository {
  constructor(
    private readonly handle: DatabaseHandle,
    private readonly logger?: Logger,
  ) {}

  private get connection() {
    return this.handle.connection;
  }

  initializeSchema(): Promise<void> {
    return initializeSchema(this.connection);
  }

  applyMigrations(): Promise<MigrationResult> {
    return applyMigrations(this.connection, this.logger);
  }

  replaceFileGraph(
    input: ExtractedIndexData,
    extraEdges?: readonly EdgeRow[],
    classifications?: ReadonlyMap<string, SymbolClassificationRecord>,
    annotations?: readonly unknown[],
  ): Promise<void> {
    return replaceFileGraph(this.connection, input, extraEdges, classifications, annotations);
  }

  setFileFramework(fileId: string, framework: string | null, role: string | null): Promise<void> {
    return setFileFramework(this.connection, fileId, framework, role);
  }

  replaceWorkspaceFrameworks(rows: readonly DetectedFrameworkRow[]): Promise<void> {
    return replaceWorkspaceFrameworks(this.connection, rows);
  }

  resolveWorkspaceCrossFileEdges(workspaceRoot: string): Promise<void> {
    return resolveWorkspaceCrossFileEdges(this.connection, workspaceRoot);
  }

  stampResolutionTier(): Promise<void> {
    return stampResolutionTier(this.connection);
  }

  synthesizeFolderTree(): Promise<void> {
    return synthesizeFolderTree(this.connection);
  }

  getUnresolvedCallSites(workspaceRoot: string) {
    return getUnresolvedCallSites(this.connection, workspaceRoot);
  }

  findSymbolIdAt(filePath: string, line: number): Promise<string | null> {
    return findSymbolIdAt(this.connection, filePath, line);
  }

  persistPreciseEdges(resolutions: readonly PreciseResolution[]): Promise<number> {
    return persistPreciseEdges(this.connection, resolutions);
  }

  getWorkspaceSubgraph(workspaceRoot: string): Promise<WorkspaceSubgraph> {
    return getWorkspaceSubgraph(this.connection, workspaceRoot);
  }

  getSymbolsForFile(relativePath: string): Promise<StoredSymbol[]> {
    return getSymbolsForFile(this.connection, relativePath);
  }

  getAllFiles(): Promise<StoredFile[]> {
    return getAllFilesQuery(this.connection);
  }

  getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]> {
    return getPresentEdgeKinds(this.connection, workspaceRoot);
  }

  getCoverageReport(): Promise<CoverageReport> {
    return getCoverageReport(this.connection);
  }

  getSessionSummary(workspaceRoot: string): Promise<SessionSummary> {
    return querySessionSummary(this.connection, workspaceRoot);
  }

  neighborhood(nodeId: string, options: NeighborhoodOptions): Promise<NeighborhoodResult> {
    return neighborhood(this.connection, nodeId, options);
  }

  writeWorkspaceCacheSnapshot(input: WriteWorkspaceCacheSnapshotInput): Promise<void> {
    return writeWorkspaceCacheSnapshot(this.connection, input);
  }

  validateWorkspaceCache(identity: WorkspaceCacheIdentity): Promise<WorkspaceCacheValidation> {
    return validateWorkspaceCache(this.connection, identity);
  }

  clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceResult> {
    return clearWorkspace(this.connection, workspaceRoot);
  }

  clearFile(filePath: string): Promise<ClearFileResult> {
    return clearFile(this.connection, filePath);
  }

  clearAll(): Promise<ClearAllResult> {
    return clearAll(this.connection);
  }

  dispose(): void {
    this.handle.close();
  }
}

/**
 * DuckDB-backed {@link ForeignGraphReader}. Stateless: the underlying functions
 * each open the foreign database read-only by path and close it themselves, so
 * there is no held connection.
 */
export class DuckDbForeignGraphReader implements ForeignGraphReader {
  readWorkspaceIndexSummary(dbPath: string): Promise<WorkspaceIndexSummary | null> {
    return readWorkspaceIndexSummary(dbPath);
  }

  readWorkspaceGraph(dbPath: string, workspaceRoot: string): Promise<ForeignWorkspaceGraph | null> {
    return readWorkspaceGraph(dbPath, workspaceRoot);
  }
}
