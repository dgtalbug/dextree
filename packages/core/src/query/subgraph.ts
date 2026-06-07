import type { GraphDbConnection } from "../storage/db.js";
import { MultiDirectedGraph } from "graphology";

import type {
  ArchitecturalLayer,
  EntryKind,
  FrameworkDetectionSource,
  FrameworkInfo,
  GraphEdge,
  GraphNode,
  SymbolRange,
  WorkspaceSubgraph,
} from "../types.js";
import { computeNodeImportance } from "./pagerank.js";

function workspaceParams(workspaceRoot: string) {
  return {
    workspace_root: workspaceRoot,
    workspace_prefix: workspaceRoot.endsWith("/") ? `${workspaceRoot}%` : `${workspaceRoot}/%`,
  };
}

/**
 * Fetch resolved symbol→symbol edges of one kind, both endpoints inside the
 * workspace. CALLS/INHERITS/INSTANTIATES/IMPLEMENTS share this exact shape; only
 * the edge kind differs. The kind is a fixed literal (never user input), so it is
 * interpolated directly rather than bound.
 */
async function queryResolvedEdges(
  connection: GraphDbConnection,
  kind: "CALLS" | "INHERITS" | "INSTANTIATES" | "IMPLEMENTS",
  params: ReturnType<typeof workspaceParams>,
): Promise<Record<string, unknown>[]> {
  return (
    await connection.run(
      `
        SELECT
          MIN(e.id) AS id,
          e.source_id AS source,
          e.target_id AS target
        FROM edge e
        INNER JOIN symbol src_symbol ON src_symbol.id = e.source_id
        INNER JOIN symbol dst_symbol ON dst_symbol.id = e.target_id
        INNER JOIN file src_file ON src_file.id = src_symbol.file_id
        INNER JOIN file dst_file ON dst_file.id = dst_symbol.file_id
        WHERE e.kind = '${kind}'
          AND e.target_id IS NOT NULL
          AND (src_file.path = $workspace_root OR src_file.path LIKE $workspace_prefix)
          AND (dst_file.path = $workspace_root OR dst_file.path LIKE $workspace_prefix)
        GROUP BY e.source_id, e.target_id
        ORDER BY source ASC, target ASC
      `,
      params,
    )
  ).getRowObjectsJS();
}

function normalizeRange(value: unknown): SymbolRange {
  const range = value as Record<string, unknown>;

  return {
    startLine: Number(range.start_line),
    startCol: Number(range.start_col),
    endLine: Number(range.end_line),
    endCol: Number(range.end_col),
  };
}

/**
 * DuckDB returns `VARCHAR[]` columns as JS arrays. NULL maps to undefined so
 * downstream "is this defined?" checks behave correctly. An empty array stays
 * as `[]` — meaningful distinct from undefined.
 */
function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  return undefined;
}

const ENTRY_KIND_VALUES = new Set<EntryKind>([
  "runtime",
  "handler",
  "test",
  "public-api",
  "unclassified",
]);

const ARCH_LAYER_VALUES = new Set<ArchitecturalLayer>([
  "presentation",
  "application",
  "domain",
  "infrastructure",
  "test",
  "unknown",
]);

/**
 * Pre-v6 rows carry NULL until the next reindex rewrites them; unknown
 * persisted values would mean a future writer wrote a string this build
 * doesn't recognize. Both fall back to undefined so the renderer treats
 * them like `unclassified` — the conservative degradation path.
 */
function normalizeEntryKind(value: unknown): EntryKind | undefined {
  if (typeof value !== "string") return undefined;
  return ENTRY_KIND_VALUES.has(value as EntryKind) ? (value as EntryKind) : undefined;
}

function normalizeArchLayer(value: unknown): ArchitecturalLayer | undefined {
  if (typeof value !== "string") return undefined;
  return ARCH_LAYER_VALUES.has(value as ArchitecturalLayer)
    ? (value as ArchitecturalLayer)
    : undefined;
}

export async function getWorkspaceSubgraph(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<WorkspaceSubgraph> {
  const params = workspaceParams(workspaceRoot);

  const fileRows = await (
    await connection.run(
      `
        SELECT
          id,
          relative_path AS label,
          path AS filePath,
          framework,
          framework_role AS frameworkRole,
          is_core AS isCore
        FROM file
        WHERE path = $workspace_root OR path LIKE $workspace_prefix
        ORDER BY relative_path ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  const frameworkRows = await (
    await connection.run(
      `
        SELECT framework_name, detection_source, confidence
        FROM workspace_framework
        ORDER BY framework_name ASC
      `,
    )
  ).getRowObjectsJS();

  const frameworks: FrameworkInfo[] = frameworkRows.map((row) => ({
    name: String(row.framework_name),
    detectionSource: String(row.detection_source) as FrameworkDetectionSource,
    confidence: Number(row.confidence ?? 1),
  }));

  const symbolRows = await (
    await connection.run(
      `
        SELECT
          s.id,
          s.name AS label,
          f.path AS filePath,
          s.kind AS symbolKind,
          s.range AS range,
          s.fan_in AS fanIn,
          s.is_core AS isCore,
          s.flags AS flags,
          s.signature AS signature,
          s.docstring AS docstring,
          s.entry_kind AS entryKind,
          s.arch_layer AS archLayer,
          s.enclosing_symbol_id AS enclosingSymbolId
        FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix
        ORDER BY f.relative_path ASC, s.name ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  // Count annotations per parent symbol so the graph view's Decorator
  // node-filter chip can become truthful (and not a placeholder). An empty
  // result is the honest signal for an unsupported workspace.
  const annotationCountRows = await (
    await connection.run(
      `
        SELECT a.parent_symbol_id AS symbolId, COUNT(*) AS annotationCount
        FROM annotation a
        INNER JOIN symbol s ON s.id = a.parent_symbol_id
        INNER JOIN file f ON f.id = s.file_id
        WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix
        GROUP BY a.parent_symbol_id
      `,
      params,
    )
  ).getRowObjectsJS();
  const annotationCountsBySymbolId = new Map<string, number>();
  for (const row of annotationCountRows) {
    const key = typeof row.symbolId === "string" ? row.symbolId : String(row.symbolId);
    annotationCountsBySymbolId.set(key, Number(row.annotationCount));
  }

  const definesRows = await (
    await connection.run(
      `
        SELECT
          e.id,
          e.source_id AS source,
          e.target_id AS target
        FROM edge e
        INNER JOIN file f ON f.id = e.source_id
        INNER JOIN symbol s ON s.id = e.target_id
        WHERE (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
          AND e.kind IN ('DEFINES', 'structural')
        ORDER BY e.source_id ASC, e.target_id ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  // Post-v3: IMPORTS edges live in the unified `edge` table. The target file id
  // is resolved at query time via JOIN on metadata.import_path → file.relative_path
  // (writers leave target_id NULL because the destination file may not be indexed
  // yet when the source file is parsed).
  const importRows = await (
    await connection.run(
      `
        SELECT
          MIN(e.id) AS id,
          src.id AS source,
          dst.id AS target
        FROM edge e
        INNER JOIN file src ON src.id = e.source_id
        INNER JOIN file dst ON dst.relative_path = json_extract_string(e.metadata, '$.import_path')
        WHERE e.kind = 'IMPORTS'
          AND (src.path = $workspace_root OR src.path LIKE $workspace_prefix)
          AND (dst.path = $workspace_root OR dst.path LIKE $workspace_prefix)
        GROUP BY src.id, dst.id
        ORDER BY src.id ASC, dst.id ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  // Resolved symbol→symbol edges (both endpoints in the workspace). Pass-1 may
  // leave target_id NULL (unresolved); these queries show only resolved edges.
  // IMPLEMENTS is kept a distinct kind from INHERITS so the classDiagram renderer
  // can use a different arrow (`<|..`) and the edge filter exposes them separately.
  const callRows = await queryResolvedEdges(connection, "CALLS", params);
  const inheritsRows = await queryResolvedEdges(connection, "INHERITS", params);
  const instantiatesRows = await queryResolvedEdges(connection, "INSTANTIATES", params);
  const implementsRows = await queryResolvedEdges(connection, "IMPLEMENTS", params);

  const nodes: GraphNode[] = [
    ...fileRows.map((row) => {
      const filePath = String(row.filePath);
      const relativePath = String(row.label);
      const basename = relativePath.split("/").pop() ?? relativePath;
      const framework = typeof row.framework === "string" ? row.framework : undefined;
      const frameworkRole = typeof row.frameworkRole === "string" ? row.frameworkRole : undefined;
      const isCore = typeof row.isCore === "boolean" ? row.isCore : undefined;

      return {
        id: String(row.id),
        type: "file" as const,
        label: basename,
        filePath,
        startLine: 1,
        ...(framework === undefined ? {} : { framework }),
        ...(frameworkRole === undefined ? {} : { frameworkRole }),
        ...(isCore === undefined ? {} : { isCore }),
      };
    }),
    ...symbolRows.map((row) => {
      const range = normalizeRange(row.range);
      const symbolKind =
        typeof row.symbolKind === "string"
          ? (row.symbolKind as GraphNode["symbolKind"])
          : undefined;
      const fanIn = typeof row.fanIn === "number" ? row.fanIn : undefined;
      const isCore = typeof row.isCore === "boolean" ? row.isCore : undefined;
      const baseFlags = normalizeStringArray(row.flags);
      const signature = typeof row.signature === "string" ? row.signature : undefined;
      const docstring = typeof row.docstring === "string" ? row.docstring : undefined;
      const entryKind = normalizeEntryKind(row.entryKind);
      const archLayer = normalizeArchLayer(row.archLayer);
      const rawEnclosing = row.enclosingSymbolId;
      const enclosingSymbolId =
        typeof rawEnclosing === "string" && rawEnclosing.length > 0 ? rawEnclosing : undefined;
      const symbolId = String(row.id);
      const annotationCount = annotationCountsBySymbolId.get(symbolId) ?? 0;
      // Project decorator-backed presence onto the node's flags so the
      // Decorator node-filter chip in the webview can become a truthful filter
      // instead of a disabled stub.
      const flags =
        annotationCount > 0
          ? (Object.freeze([...(baseFlags ?? []), "decorator-backed"]) as readonly string[])
          : baseFlags;

      return {
        id: symbolId,
        type: "symbol" as const,
        label: String(row.label),
        filePath: String(row.filePath),
        startLine: range.startLine + 1,
        ...(symbolKind === undefined ? {} : { symbolKind }),
        ...(fanIn === undefined ? {} : { fanIn }),
        ...(isCore === undefined ? {} : { isCore }),
        ...(flags === undefined ? {} : { flags }),
        ...(signature === undefined ? {} : { signature }),
        ...(docstring === undefined ? {} : { docstring }),
        ...(entryKind === undefined ? {} : { entryKind }),
        ...(archLayer === undefined ? {} : { archLayer }),
        ...(enclosingSymbolId === undefined ? {} : { enclosingSymbolId }),
      };
    }),
  ];

  // In-scope-parent filter: a symbol's enclosingSymbolId only makes sense
  // when the parent class is also present in the projected node set. If the
  // parent is out of scope (e.g. file-scoped query that didn't include the
  // class definition), clear the field so consumers like the classDiagram
  // serializer don't dangle a pointer at a phantom id.
  const projectedNodeIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    if (
      node.type === "symbol" &&
      node.enclosingSymbolId !== undefined &&
      !projectedNodeIds.has(node.enclosingSymbolId)
    ) {
      delete node.enclosingSymbolId;
    }
  }

  const edges: GraphEdge[] = [
    ...definesRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "DEFINES" as const,
    })),
    ...importRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "IMPORTS" as const,
    })),
    ...callRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "CALLS" as const,
    })),
    ...inheritsRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "INHERITS" as const,
    })),
    ...instantiatesRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "INSTANTIATES" as const,
    })),
    ...implementsRows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      target: String(row.target),
      kind: "IMPLEMENTS" as const,
    })),
  ];

  enrichWithImportance(nodes, edges);

  return { nodes, edges, frameworks };
}

function enrichWithImportance(nodes: GraphNode[], edges: GraphEdge[]): void {
  if (nodes.length === 0) {
    return;
  }

  const transient = new MultiDirectedGraph();
  const nodeIds = new Set<string>();

  for (const node of nodes) {
    if (!nodeIds.has(node.id)) {
      transient.addNode(node.id);
      nodeIds.add(node.id);
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    transient.addEdge(edge.source, edge.target);
  }

  const scores = computeNodeImportance(transient);

  for (const node of nodes) {
    const score = scores.get(node.id);
    if (typeof score === "number" && Number.isFinite(score)) {
      node.importance = score;
    }
  }
}
