import type { SymbolRange } from "../types.js";

/**
 * Canonical edge-metadata key names. These keys are written by the extraction
 * engine, read by the resolution SQL, and projected by the subgraph query — three
 * places that previously hardcoded the same string literals (RULE-ARCH-007). A
 * drifted key here is a single edit, and `EdgeMetadata` makes a typo on the
 * TypeScript side a compile error.
 */
export const EDGE_META_KEYS = {
  /** CALLS: the called symbol's name. */
  calleeName: "callee_name",
  /** INHERITS: the parent class name. */
  parentName: "parent_name",
  /** INSTANTIATES: the constructed class name. */
  className: "class_name",
  /** IMPLEMENTS: the implemented interface name. */
  interfaceName: "interface_name",
  /** REFERENCES: the referenced symbol's name. */
  referencedName: "referenced_name",
  /** RE_EXPORTS: the re-exported module path. */
  reexportPath: "reexport_path",
  /** Source symbol fqn, used to resolve the edge's source_id. */
  sourceFqn: "source_fqn",
  /** IMPORTS: the imported module's resolved path (read at query time). */
  importPath: "import_path",
  /** Call-site range in the source file. */
  callSiteRange: "call_site_range",
  /** Reference-site range in the source file. */
  referenceRange: "reference_range",
  /** Resolution tier stamped by the resolver: precise | heuristic | unresolved | structural. */
  resolution: "resolution",
  /** Numeric confidence for the resolution tier. */
  confidence: "confidence",
} as const;

/**
 * A single-quoted `'$.key'` JSON path literal for embedding directly in a DuckDB
 * `json_extract_string(metadata, ...)` call. Quotes are included so it drops into
 * the SQL string as a valid string literal.
 */
export function metaPath(key: keyof typeof EDGE_META_KEYS): string {
  return `'$.${EDGE_META_KEYS[key]}'`;
}

/**
 * Typed view of `edge.metadata`. All fields optional — a given edge kind only
 * populates the subset relevant to it. Stored as JSON; this is the in-memory
 * contract producers and consumers agree on.
 */
export interface EdgeMetadata {
  callee_name?: string;
  parent_name?: string;
  class_name?: string;
  interface_name?: string;
  referenced_name?: string;
  reexport_path?: string;
  source_fqn?: string | null;
  import_path?: string;
  call_site_range?: SymbolRange;
  reference_range?: SymbolRange;
  resolution?: "precise" | "heuristic" | "unresolved" | "structural";
  confidence?: number;
}
