// Schema version history:
//   1 — initial baseline (slice 008 era)
//   2 — adds annotation, module, test core entity tables (migration 002)
//   3 — unifies call_site + import_ref into edge with kind/metadata (migration 003)
//   4 — adds workspace_cache table (migration 004)
//   5 — adds workspace_framework table + file.framework columns (migration 005)
//   6 — adds symbol.entry_kind + symbol.arch_layer classification columns (migration 006)
//   7 — adds symbol.enclosing_symbol_id classification column (migration 007)
export const SCHEMA_VERSION = 7;

export interface WorkspaceCacheIdentity {
  cacheKey: string;
  workspaceRoot: string;
  repoRoot: string | null;
  repoRemote: string | null;
}

export interface WorkspaceCacheMetadata {
  schemaVersion: number;
  lastSuccessfulIndexAt: string | null;
  indexedFileCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
}

export type WorkspaceCacheStatus = "missing" | "empty" | "ready" | "invalid";

export type WorkspaceCacheInvalidReason =
  | "missing-metadata"
  | "identity-mismatch"
  | "schema-mismatch"
  | "unreadable"
  | "no-graph-data";

export interface WorkspaceCacheValidation {
  status: WorkspaceCacheStatus;
  identity: WorkspaceCacheIdentity;
  metadata: WorkspaceCacheMetadata | null;
  reason?: WorkspaceCacheInvalidReason;
}

export interface WorkspaceCacheLoadResult {
  validation: WorkspaceCacheValidation;
  shouldHydrateFromCache: boolean;
}

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "method";

export type EntryKind = "runtime" | "handler" | "test" | "public-api" | "unclassified";

export type ArchitecturalLayer =
  | "presentation"
  | "application"
  | "domain"
  | "infrastructure"
  | "test"
  | "unknown";

export interface SymbolClassificationRecord {
  entryKind: EntryKind;
  archLayer: ArchitecturalLayer;
}

export type GraphNodeType = "file" | "symbol";

export type GraphEdgeKind = "DEFINES" | "IMPORTS" | "CALLS" | "INHERITS" | "INSTANTIATES";

export interface SymbolRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  filePath: string;
  startLine: number;
  symbolKind?: SymbolKind;
  importance?: number;
  framework?: string;
  frameworkRole?: string;
  fanIn?: number;
  isCore?: boolean;
  flags?: readonly string[];
  signature?: string;
  docstring?: string;
  /** Set on `type: "symbol"` nodes only. Absent on file nodes. */
  entryKind?: EntryKind;
  /** Set on `type: "symbol"` nodes only. Absent on file nodes. */
  archLayer?: ArchitecturalLayer;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export type FrameworkDetectionSource = "manifest" | "structural" | "manifest+structural";

export interface FrameworkInfo {
  name: string;
  detectionSource: FrameworkDetectionSource;
  confidence: number;
}

export interface WorkspaceSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  frameworks: readonly FrameworkInfo[];
}

export interface StoredSymbol {
  id: string;
  fqn: string;
  name: string;
  kind: SymbolKind;
  fileId: string;
  range: SymbolRange;
  language: string;
}

export interface FileRecord {
  id: string;
  path: string;
  relativePath: string;
  language: string;
  loc: number;
  hash: string;
  lastIndexed: Date;
}

export interface StoredFile {
  id: string;
  path: string;
  relativePath: string;
  language: string;
  hash: string;
}

export interface IndexResult {
  relativePath: string;
  symbolCount: number;
  symbols: StoredSymbol[];
  elapsedMs: number;
}

export interface ClearWorkspaceSummary {
  deletedFiles: number;
  deletedSymbols: number;
  deletedEdges: number;
}

export interface ClearFileSummary {
  deletedFiles: number; // 0 | 1
  deletedSymbols: number;
  deletedEdges: number;
}

export interface ClearAllSummary {
  clearedTables: number;
}

/** A single file entry in the session summary top-files table. */
export interface TopFile {
  /** Relative path from workspace root (e.g. "src/index.ts") */
  path: string;
  /** Number of symbols defined in this file */
  symbolCount: number;
}

/** An edge-kind bucket in the session summary edge table. */
export interface EdgeKindCount {
  /** Edge kind label (e.g. "CALLS", "IMPORTS", "DEFINES") */
  kind: string;
  /** Number of edges of this kind in the graph */
  count: number;
}

/**
 * Transient in-memory snapshot of the workspace graph state.
 * Produced by `querySessionSummary` in `packages/core`.
 * Never persisted to DuckDB.
 */
export interface SessionSummary {
  /** Basename of the workspace root folder */
  workspaceName: string;
  /** Timestamp at which the summary was generated */
  generatedAt: Date;
  /** Total number of indexed files */
  fileCount: number;
  /** Total number of indexed symbols across all files */
  symbolCount: number;
  /** Top files by symbol count, capped at 10 rows, descending */
  topFiles: TopFile[];
  /** Edge kinds present in the graph with counts, descending by count */
  edgeKindCounts: EdgeKindCount[];
}

/**
 * Thrown by `querySessionSummary` when the graph contains no indexed files.
 * The export command catches this and shows "Index your workspace first"
 * without writing any file (FR-005).
 */
export class EmptyGraphError extends Error {
  constructor() {
    super("No files have been indexed in this workspace.");
    this.name = "EmptyGraphError";
  }
}

export interface Indexer {
  initialize(): Promise<void>;
  indexFile(
    absolutePath: string,
    workspaceRoot: string,
    cacheIdentity?: WorkspaceCacheIdentity,
  ): Promise<IndexResult>;
  /**
   * Detect application frameworks present in a workspace and persist them to
   * `workspace_framework`. Caches the detected list internally so subsequent
   * `indexFile` calls can attribute per-file framework + role without re-detecting.
   *
   * Call once at the start of a workspace indexing pass, before the per-file loop.
   */
  detectWorkspaceFrameworks(workspaceRoot: string): Promise<readonly FrameworkInfo[]>;
  /**
   * Run after all files in a workspace have been indexed.
   *
   * Resolves cross-file CALLS / INHERITS / INSTANTIATES edges whose
   * `target_id` remained NULL after the per-file SQL post-pass (because the
   * target symbol lives in a different file that was indexed separately).
   * Safe to call after a partial index (cancelled or errored) — it will
   * resolve whatever cross-file edges it can find.
   */
  finalizeWorkspace(workspaceRoot: string): Promise<void>;
  validateWorkspaceCache(identity: WorkspaceCacheIdentity): Promise<WorkspaceCacheValidation>;
  getSymbols(relativePath: string): Promise<StoredSymbol[]>;
  getAllFiles(): Promise<StoredFile[]>;
  getWorkspaceSubgraph(workspaceRoot: string): Promise<WorkspaceSubgraph>;
  getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]>;
  getSessionSummary(workspaceRoot: string): Promise<SessionSummary>;
  clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceSummary>;
  clearFile(filePath: string): Promise<ClearFileSummary>;
  clearAll(): Promise<ClearAllSummary>;
  dispose(): Promise<void>;
}

export interface ExtractedFileRecord {
  id: string;
  path: string;
  relativePath: string;
  language: string;
  loc: number;
  hash: string;
}

export interface ExtractedImportRef {
  id: string;
  fileId: string;
  importPath: string;
  importedSymbol: string | null;
  range: SymbolRange;
  language: string;
}

export interface ExtractedIndexData {
  file: ExtractedFileRecord;
  symbols: StoredSymbol[];
  imports: ExtractedImportRef[];
}
