import type { DuckDBConnection } from "@duckdb/node-api";
import { MultiDirectedGraph } from "graphology";

import type { GraphEdge, GraphNode, SymbolRange, WorkspaceSubgraph } from "../types.js";
import { computeNodeImportance } from "./pagerank.js";

function workspaceParams(workspaceRoot: string) {
  return {
    workspace_root: workspaceRoot,
    workspace_prefix: workspaceRoot.endsWith("/") ? `${workspaceRoot}%` : `${workspaceRoot}/%`,
  };
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

export async function getWorkspaceSubgraph(
  connection: DuckDBConnection,
  workspaceRoot: string,
): Promise<WorkspaceSubgraph> {
  const params = workspaceParams(workspaceRoot);

  const fileRows = await (
    await connection.run(
      `
        SELECT
          id,
          relative_path AS label,
          path AS filePath
        FROM file
        WHERE path = $workspace_root OR path LIKE $workspace_prefix
        ORDER BY relative_path ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  const symbolRows = await (
    await connection.run(
      `
        SELECT
          s.id,
          s.name AS label,
          f.path AS filePath,
          s.kind AS symbolKind,
          s.range AS range
        FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix
        ORDER BY f.relative_path ASC, s.name ASC
      `,
      params,
    )
  ).getRowObjectsJS();

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

  // Post-v3: CALLS edges live in the unified `edge` table too. Pass-1 may leave
  // target_id NULL (unresolved); pass-2 LSP (S8) will fill it in. This query
  // shows only resolved calls.
  const callRows = await (
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
        WHERE e.kind = 'CALLS'
          AND e.target_id IS NOT NULL
          AND (src_file.path = $workspace_root OR src_file.path LIKE $workspace_prefix)
          AND (dst_file.path = $workspace_root OR dst_file.path LIKE $workspace_prefix)
        GROUP BY e.source_id, e.target_id
        ORDER BY source ASC, target ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  const nodes: GraphNode[] = [
    ...fileRows.map((row) => {
      const filePath = String(row.filePath);
      const relativePath = String(row.label);
      const basename = relativePath.split("/").pop() ?? relativePath;

      return {
        id: String(row.id),
        type: "file" as const,
        label: basename,
        filePath,
        startLine: 1,
      };
    }),
    ...symbolRows.map((row) => {
      const range = normalizeRange(row.range);
      const symbolKind =
        typeof row.symbolKind === "string"
          ? (row.symbolKind as GraphNode["symbolKind"])
          : undefined;
      return {
        id: String(row.id),
        type: "symbol" as const,
        label: String(row.label),
        filePath: String(row.filePath),
        startLine: range.startLine + 1,
        ...(symbolKind === undefined ? {} : { symbolKind }),
      };
    }),
  ];

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
  ];

  enrichWithImportance(nodes, edges);

  return { nodes, edges };
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
