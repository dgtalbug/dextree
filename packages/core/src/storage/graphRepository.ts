import type { EdgeRow } from "../extractors/types.js";
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
} from "../types.js";
import type { ClearAllResult, ClearFileResult, ClearWorkspaceResult } from "./clear.js";
import type { MigrationResult } from "./migrations/runner.js";
import type { DetectedFrameworkRow } from "./repository.js";
import type { WriteWorkspaceCacheSnapshotInput } from "./workspaceCache.js";
import type { ForeignWorkspaceGraph, WorkspaceIndexSummary } from "./workspaceRegistry.js";

/**
 * The storage + query operations the domain depends on (RULE-ARCH-003). One
 * method per persistence operation; the database connection is held by the
 * implementing adapter and never appears in a signature, so no consumer touches
 * a connection or the driver. The lens selectors / importance computations are
 * deliberately absent — they operate on the in-memory graphology graph, not the
 * database, so they stay pure functions, not repository methods.
 *
 * Foreign read-only access to *other* workspaces' database files is a separate
 * port ({@link ForeignGraphReader}); those reads open arbitrary databases by
 * path and are driven by the extension, not by the connection-owning repository.
 */
export interface GraphRepository {
  // ---- lifecycle / schema ----
  initializeSchema(): Promise<void>;
  applyMigrations(): Promise<MigrationResult>;

  // ---- file writes (the indexing write path) ----
  replaceFileGraph(
    input: ExtractedIndexData,
    extraEdges?: readonly EdgeRow[],
    classifications?: ReadonlyMap<string, SymbolClassificationRecord>,
    annotations?: readonly unknown[],
  ): Promise<void>;
  setFileFramework(fileId: string, framework: string | null, role: string | null): Promise<void>;
  replaceWorkspaceFrameworks(rows: readonly DetectedFrameworkRow[]): Promise<void>;

  // ---- resolution (the indexer drives all three directly during its pass) ----
  resolveWorkspaceCrossFileEdges(workspaceRoot: string): Promise<void>;
  stampResolutionTier(): Promise<void>;
  synthesizeFolderTree(): Promise<void>;

  // ---- reads (the query surface consumed by the app + UI) ----
  getWorkspaceSubgraph(workspaceRoot: string): Promise<WorkspaceSubgraph>;
  getSymbolsForFile(relativePath: string): Promise<StoredSymbol[]>;
  getAllFiles(): Promise<StoredFile[]>;
  getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]>;
  getCoverageReport(): Promise<CoverageReport>;
  getSessionSummary(workspaceRoot: string): Promise<SessionSummary>;
  neighborhood(nodeId: string, options: NeighborhoodOptions): Promise<NeighborhoodResult>;

  // ---- workspace cache ----
  writeWorkspaceCacheSnapshot(input: WriteWorkspaceCacheSnapshotInput): Promise<void>;
  validateWorkspaceCache(identity: WorkspaceCacheIdentity): Promise<WorkspaceCacheValidation>;

  // ---- clears ----
  clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceResult>;
  clearFile(filePath: string): Promise<ClearFileResult>;
  clearAll(): Promise<ClearAllResult>;

  /** Release the underlying connection/instance. */
  dispose(): void;
}

/**
 * Read-only access to *other* workspaces' database files — the workspace
 * switcher. Separate from {@link GraphRepository} because these reads open
 * arbitrary databases addressed by `dbPath` (read-only, never mutating) and are
 * driven by the extension, not the connection-owning repository. Conflating them
 * would give one interface two lifecycle owners.
 */
export interface ForeignGraphReader {
  readWorkspaceIndexSummary(dbPath: string): Promise<WorkspaceIndexSummary | null>;
  readWorkspaceGraph(dbPath: string, workspaceRoot: string): Promise<ForeignWorkspaceGraph | null>;
}
