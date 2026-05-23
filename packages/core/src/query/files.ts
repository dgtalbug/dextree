import type { DuckDBConnection } from "@duckdb/node-api";

import type { StoredFile } from "../types.js";

export async function getAllFilesQuery(connection: DuckDBConnection): Promise<StoredFile[]> {
  const rows = await (
    await connection.run(`
      SELECT
        id,
        path,
        relative_path AS relativePath,
        language,
        hash
      FROM file
      ORDER BY relative_path ASC
    `)
  ).getRowObjectsJS();

  return rows.map((row) => ({
    id: String(row.id),
    path: String(row.path),
    relativePath: String(row.relativePath),
    language: String(row.language),
    hash: String(row.hash),
  }));
}
