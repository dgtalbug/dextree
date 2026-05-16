import type { DuckDBConnection } from "@duckdb/node-api";

import type { StoredSymbol, SymbolRange } from "../types.js";

function normalizeRange(value: unknown): SymbolRange {
  const range = value as Record<string, unknown>;

  return {
    startLine: Number(range.start_line),
    startCol: Number(range.start_col),
    endLine: Number(range.end_line),
    endCol: Number(range.end_col),
  };
}

export async function getSymbolsForFile(
  connection: DuckDBConnection,
  relativePath: string,
): Promise<StoredSymbol[]> {
  const rows = await (
    await connection.run(
      `
      SELECT
        s.id,
        s.fqn,
        s.name,
        s.kind,
        s.file_id AS fileId,
        s.range,
        s.language
      FROM symbol s
      INNER JOIN file f ON f.id = s.file_id
      WHERE f.relative_path = $relative_path
      ORDER BY s.name ASC
    `,
      { relative_path: relativePath },
    )
  ).getRowObjectsJS();

  return rows.map((row) => ({
    id: String(row.id),
    fqn: String(row.fqn),
    name: String(row.name),
    kind: row.kind as StoredSymbol["kind"],
    fileId: String(row.fileId),
    range: normalizeRange(row.range),
    language: String(row.language),
  }));
}
