export const SCHEMA_VERSION = 1;

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

export interface Indexer {
  initialize(): Promise<void>;
  indexFile(absolutePath: string, workspaceRoot: string): Promise<IndexResult>;
  getSymbols(relativePath: string): Promise<StoredSymbol[]>;
  getAllFiles(): Promise<StoredFile[]>;
  getWorkspaceSubgraph(workspaceRoot: string): Promise<WorkspaceSubgraph>;
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
