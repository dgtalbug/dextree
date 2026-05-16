export const SCHEMA_VERSION = 1;

export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "variable";

export interface SymbolRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
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

export interface ExtractedIndexData {
  file: ExtractedFileRecord;
  symbols: StoredSymbol[];
}
