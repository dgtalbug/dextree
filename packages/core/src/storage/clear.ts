import type { GraphDbConnection } from "./db.js";

import { initializeSchema, REQUIRED_TABLES } from "./schema.js";

export interface ClearWorkspaceResult {
  deletedFiles: number;
  deletedSymbols: number;
  deletedEdges: number;
}

export interface ClearFileResult {
  deletedFiles: number; // 0 | 1
  deletedSymbols: number;
  deletedEdges: number;
}

export interface ClearAllResult {
  clearedTables: number;
}

function workspaceParams(workspaceRoot: string) {
  return {
    workspace_root: workspaceRoot,
    workspace_prefix: workspaceRoot.endsWith("/") ? `${workspaceRoot}%` : `${workspaceRoot}/%`,
  };
}

async function countMatchingFiles(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<number> {
  const rows = await (
    await connection.run(
      `SELECT COUNT(*) AS count FROM file
       WHERE path = $workspace_root OR path LIKE $workspace_prefix`,
      workspaceParams(workspaceRoot),
    )
  ).getRowObjectsJS();

  return Number(rows[0]?.count ?? 0);
}

async function countMatchingSymbols(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<number> {
  const rows = await (
    await connection.run(
      `SELECT COUNT(*) AS count FROM symbol s
       INNER JOIN file f ON f.id = s.file_id
       WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix`,
      workspaceParams(workspaceRoot),
    )
  ).getRowObjectsJS();

  return Number(rows[0]?.count ?? 0);
}

async function countMatchingEdges(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<number> {
  // Two separate COUNT queries because DuckDB's named-parameter binding
  // fails when the same $name appears more than once in a single prepared
  // statement ("Failed to retrieve bind parameter index"). Summed in JS.
  const fromFileRows = await (
    await connection.run(
      `SELECT COUNT(*) AS count FROM edge e
       WHERE e.source_id IN (
         SELECT id FROM file WHERE path = $workspace_root OR path LIKE $workspace_prefix
       )`,
      workspaceParams(workspaceRoot),
    )
  ).getRowObjectsJS();

  const fromSymbolRows = await (
    await connection.run(
      `SELECT COUNT(*) AS count FROM edge e
       WHERE e.source_id IN (
         SELECT s.id FROM symbol s INNER JOIN file f ON f.id = s.file_id
         WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix
       )`,
      workspaceParams(workspaceRoot),
    )
  ).getRowObjectsJS();

  return Number(fromFileRows[0]?.count ?? 0) + Number(fromSymbolRows[0]?.count ?? 0);
}

export async function clearWorkspace(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<ClearWorkspaceResult> {
  const params = workspaceParams(workspaceRoot);

  const deletedFiles = await countMatchingFiles(connection, workspaceRoot);
  const deletedSymbols = await countMatchingSymbols(connection, workspaceRoot);
  const deletedEdges = await countMatchingEdges(connection, workspaceRoot);

  await connection.run("BEGIN TRANSACTION");

  try {
    // NOTE: @duckdb/node-api throws "Failed to retrieve bind parameter index"
    // when the params dict contains a key the SQL statement does not reference.
    // Each connection.run below therefore receives ONLY the keys its SQL uses.
    const fileIdSubquery = `(SELECT id FROM file WHERE path = $workspace_root OR path LIKE $workspace_prefix)`;
    const symbolIdSubquery = `(SELECT s.id FROM symbol s INNER JOIN file f ON f.id = s.file_id
                               WHERE f.path = $workspace_root OR f.path LIKE $workspace_prefix)`;

    await connection.run(`DELETE FROM edge WHERE source_id IN ${fileIdSubquery}`, params);
    await connection.run(`DELETE FROM edge WHERE target_id IN ${fileIdSubquery}`, params);
    await connection.run(`DELETE FROM edge WHERE source_id IN ${symbolIdSubquery}`, params);
    await connection.run(`DELETE FROM edge WHERE target_id IN ${symbolIdSubquery}`, params);

    // Post-v3: call_site and import_ref sidecar tables were dropped by migration 003.
    // Their data now lives in `edge` and is cleared by the DELETE FROM edge ... statements above.
    await connection.run(`DELETE FROM diagnostic WHERE file_id IN ${fileIdSubquery}`, params);
    await connection.run(`DELETE FROM symbol WHERE file_id IN ${fileIdSubquery}`, params);
    await connection.run(`DELETE FROM file WHERE path = $workspace_root`, {
      workspace_root: params.workspace_root,
    });
    await connection.run(`DELETE FROM file WHERE path LIKE $workspace_prefix`, {
      workspace_prefix: params.workspace_prefix,
    });
    await connection.run(`DELETE FROM workspace_cache WHERE workspace_root = $workspace_root`, {
      workspace_root: params.workspace_root,
    });

    await connection.run("COMMIT");
  } catch (error) {
    await connection.run("ROLLBACK");
    throw error;
  }

  return { deletedFiles, deletedSymbols, deletedEdges };
}

export async function clearFile(
  connection: GraphDbConnection,
  filePath: string,
): Promise<ClearFileResult> {
  const fileRows = await (
    await connection.run(`SELECT id FROM file WHERE path = $path`, { path: filePath })
  ).getRowObjectsJS();

  if (fileRows.length === 0) {
    return { deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 };
  }

  const fileId = String(fileRows[0]!.id);
  const params = { file_id: fileId };

  const symbolCountRows = await (
    await connection.run(`SELECT COUNT(*) AS count FROM symbol WHERE file_id = $file_id`, params)
  ).getRowObjectsJS();
  const deletedSymbols = Number(symbolCountRows[0]?.count ?? 0);

  // Count edges by source_id only — mirrors clearWorkspace convention.
  // Two separate statements because DuckDB named-param binding fails when the
  // params dict has extra unused keys; each statement gets only the keys it uses.
  const edgeFromFileRows = await (
    await connection.run(`SELECT COUNT(*) AS count FROM edge WHERE source_id = $file_id`, params)
  ).getRowObjectsJS();
  const edgeFromSymbolRows = await (
    await connection.run(
      `SELECT COUNT(*) AS count FROM edge WHERE source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)`,
      params,
    )
  ).getRowObjectsJS();
  const deletedEdges =
    Number(edgeFromFileRows[0]?.count ?? 0) + Number(edgeFromSymbolRows[0]?.count ?? 0);

  await connection.run("BEGIN TRANSACTION");

  try {
    const symbolSubquery = `(SELECT id FROM symbol WHERE file_id = $file_id)`;
    await connection.run(`DELETE FROM edge WHERE source_id = $file_id`, params);
    await connection.run(`DELETE FROM edge WHERE target_id = $file_id`, params);
    await connection.run(`DELETE FROM edge WHERE source_id IN ${symbolSubquery}`, params);
    await connection.run(`DELETE FROM edge WHERE target_id IN ${symbolSubquery}`, params);
    await connection.run(`DELETE FROM diagnostic WHERE file_id = $file_id`, params);
    await connection.run(`DELETE FROM symbol WHERE file_id = $file_id`, params);
    await connection.run(`DELETE FROM file WHERE id = $file_id`, params);
    await connection.run("COMMIT");
  } catch (error) {
    await connection.run("ROLLBACK");
    throw error;
  }

  return { deletedFiles: 1, deletedSymbols, deletedEdges };
}

export async function clearAll(connection: GraphDbConnection): Promise<ClearAllResult> {
  await connection.run("BEGIN TRANSACTION");

  try {
    for (const table of REQUIRED_TABLES) {
      await connection.run(`DROP TABLE IF EXISTS ${table}`);
    }

    await connection.run("COMMIT");
  } catch (error) {
    await connection.run("ROLLBACK");
    throw error;
  }

  await initializeSchema(connection);

  return { clearedTables: REQUIRED_TABLES.length };
}
