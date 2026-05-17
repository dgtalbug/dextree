import type { DuckDBConnection } from "@duckdb/node-api";

import type { GraphEdge, GraphNode, SymbolRange, WorkspaceSubgraph } from "../types.js";

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

  const importRows = await (
    await connection.run(
      `
        SELECT
          MIN(ir.id) AS id,
          src.id AS source,
          dst.id AS target
        FROM import_ref ir
        INNER JOIN file src ON src.id = ir.file_id
        INNER JOIN file dst ON dst.relative_path = ir.import_path
        WHERE (src.path = $workspace_root OR src.path LIKE $workspace_prefix)
          AND (dst.path = $workspace_root OR dst.path LIKE $workspace_prefix)
        GROUP BY src.id, dst.id
        ORDER BY src.id ASC, dst.id ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  const callRows = await (
    await connection.run(
      `
        SELECT
          MIN(cs.id) AS id,
          cs.caller_symbol_id AS source,
          cs.callee_symbol_id AS target
        FROM call_site cs
        INNER JOIN symbol src_symbol ON src_symbol.id = cs.caller_symbol_id
        INNER JOIN symbol dst_symbol ON dst_symbol.id = cs.callee_symbol_id
        INNER JOIN file src_file ON src_file.id = src_symbol.file_id
        INNER JOIN file dst_file ON dst_file.id = dst_symbol.file_id
        WHERE cs.caller_symbol_id IS NOT NULL
          AND cs.callee_symbol_id IS NOT NULL
          AND (src_file.path = $workspace_root OR src_file.path LIKE $workspace_prefix)
          AND (dst_file.path = $workspace_root OR dst_file.path LIKE $workspace_prefix)
        GROUP BY cs.caller_symbol_id, cs.callee_symbol_id
        ORDER BY source ASC, target ASC
      `,
      params,
    )
  ).getRowObjectsJS();

  const nodes: GraphNode[] = [
    ...fileRows.map((row) => ({
      id: String(row.id),
      type: "file" as const,
      label: String(row.filePath ?? row.label),
      filePath: String(row.filePath),
      startLine: 1,
    })),
    ...symbolRows.map((row) => {
      const range = normalizeRange(row.range);
      return {
        id: String(row.id),
        type: "symbol" as const,
        label: String(row.label),
        filePath: String(row.filePath),
        startLine: range.startLine + 1,
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

  return { nodes, edges };
}
