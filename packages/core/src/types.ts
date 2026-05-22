// Schema version history:
//   1 — initial baseline (slice 008 era)
//   2 — adds annotation, module, test core entity tables (migration 002)
//   3 — unifies call_site + import_ref into edge with kind/metadata (migration 003)
export const SCHEMA_VERSION = 4;

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

export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "variable";

export type GraphNodeType = "file" | "symbol";

export type GraphEdgeKind = "DEFINES" | "IMPORTS" | "CALLS";

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
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface WorkspaceSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  relativePath: string;
  language: string;
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

export interface ClearAllSummary {
  clearedTables: number;
}

export interface Indexer {
  initialize(): Promise<void>;
  indexFile(
    absolutePath: string,
    workspaceRoot: string,
    cacheIdentity?: WorkspaceCacheIdentity,
  ): Promise<IndexResult>;
  validateWorkspaceCache(identity: WorkspaceCacheIdentity): Promise<WorkspaceCacheValidation>;
  getSymbols(relativePath: string): Promise<StoredSymbol[]>;
  getAllFiles(): Promise<StoredFile[]>;
  getWorkspaceSubgraph(workspaceRoot: string): Promise<WorkspaceSubgraph>;
  getPresentEdgeKinds(workspaceRoot: string): Promise<readonly string[]>;
  clearWorkspace(workspaceRoot: string): Promise<ClearWorkspaceSummary>;
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
