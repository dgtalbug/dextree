import type { DuckDBConnection } from "@duckdb/node-api";

/**
 * Returns the sorted, deduplicated set of `edge.kind` values currently present
 * in the database. Drives the webview legend so the UI never advertises an edge
 * kind the graph cannot deliver.
 *
 * NOTE: Each Indexer instance uses its own isolated database (either an in-memory
 * instance or a workspace-specific file path), so no cross-workspace filtering is
 * required — all rows in this database belong to the same workspace.
 *
 * Empty result on a fresh / empty workspace is a normal outcome, not an error.
 */
export async function getPresentEdgeKinds(
  connection: DuckDBConnection,
  _workspaceRoot: string,
): Promise<readonly string[]> {
  const rows = await (
    await connection.run(`SELECT DISTINCT kind FROM edge ORDER BY kind`)
  ).getRowObjectsJS();

  return rows.map((row) => {
    const kind = (row as Record<string, unknown>)["kind"];
    return typeof kind === "string" ? kind : String(kind);
  });
}
