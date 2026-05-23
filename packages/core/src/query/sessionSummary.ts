import type { DuckDBConnection } from "@duckdb/node-api";
import { basename } from "node:path";

import { EmptyGraphError, type SessionSummary } from "../types.js";

/**
 * Queries the live graph for a workspace summary snapshot.
 *
 * Reads `file`, `symbol`, and `edge` tables. Read- makes no schemaonly
 * or data changes (CC-001). Returns only pass-1 structural data; pass-2
 * enrichment fields are not required (CC-003).
 *
 * @throws {EmptyGraphError} when no files have been indexed (FR-005).
 */
export async function querySessionSummary(
  connection: DuckDBConnection,
  workspaceRoot: string,
): Promise<SessionSummary> {
  // 1. File count (also serves as empty-graph guard)
  const fileCountRows = await (
    await connection.run("SELECT COUNT(*) AS n FROM file")
  ).getRowObjectsJS();
  const fileCount = Number((fileCountRows[0] as Record<string, unknown>)["n"]);

  if (fileCount === 0) {
    throw new EmptyGraphError();
  }

  // 2. Symbol count
  const symbolCountRows = await (
    await connection.run("SELECT COUNT(*) AS n FROM symbol")
  ).getRowObjectsJS();
  const symbolCount = Number((symbolCountRows[0] as Record<string, unknown>)["n"]);

  // 3. Top-10 files by symbol count
  const topFileRows = await (
    await connection.run(`
      SELECT f.relative_path AS path, COUNT(s.id) AS symbol_count
      FROM file f
      LEFT JOIN symbol s ON s.file_id = f.id
      GROUP BY f.relative_path
      ORDER BY symbol_count DESC
      LIMIT 10
    `)
  ).getRowObjectsJS();

  const topFiles = topFileRows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      path: String(r["path"]),
      symbolCount: Number(r["symbol_count"]),
    };
  });

  // 4. Edge-kind counts
  const edgeRows = await (
    await connection.run(`
      SELECT kind, COUNT(*) AS count
      FROM edge
      GROUP BY kind
      ORDER BY count DESC
    `)
  ).getRowObjectsJS();

  const edgeKindCounts = edgeRows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      kind: String(r["kind"]),
      count: Number(r["count"]),
    };
  });

  return {
    workspaceName: basename(workspaceRoot),
    generatedAt: new Date(),
    fileCount,
    symbolCount,
    topFiles,
    edgeKindCounts,
  };
}
