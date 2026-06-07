import type { NodeLocation, PreciseResolution, UnresolvedCallSite } from "../resolution/types.js";
import type { GraphDbConnection } from "./db.js";
import { runInTransaction } from "./db.js";

/**
 * Precise (pass-2) resolution persistence. The heuristic pass resolves CALLS
 * targets by name; this layer lets the host's language server upgrade them to the
 * `precise` tier and write the result back, so the whole projected graph (not just
 * an inspected node) reflects precise resolution. All SQL stays here, behind the
 * repository — the LSP bridge lives in the extension (RULE-ARCH-005 / ARCH-010).
 */

/**
 * Every `CALLS` edge still at the heuristic/unresolved tier, paired with the
 * location of its source symbol so the host can query the language server there.
 * Edges already `precise` are skipped (never re-resolved / downgraded).
 */
export async function getUnresolvedCallSites(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<UnresolvedCallSite[]> {
  const prefix = workspaceRoot.endsWith("/") ? workspaceRoot : `${workspaceRoot}/`;
  const rows = await (
    await connection.run(
      `
        SELECT e.id AS edge_id,
               f.path AS file_path,
               src.range.start_line AS start_line,
               src.range.start_col AS start_col
        FROM edge e
        INNER JOIN symbol src ON src.id = e.source_id
        INNER JOIN file f ON f.id = src.file_id
        WHERE e.kind = 'CALLS'
          AND COALESCE(json_extract_string(e.metadata, '$.resolution'), '') <> 'precise'
          AND (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
      `,
      { workspace_root: workspaceRoot, workspace_prefix: `${prefix}%` },
    )
  ).getRowObjectsJS();

  return rows.map((row) => {
    const location: NodeLocation = {
      filePath: String(row.file_path),
      line: Number(row.start_line),
      column: Number(row.start_col),
    };
    return { edgeId: String(row.edge_id), sourceLocation: location };
  });
}

/**
 * Map a language-server result location back to a stored symbol id. Matches by
 * file path + 0-based start line (call-hierarchy items point at a definition's
 * start). Returns null when there is no match or the line is ambiguous — the
 * caller then leaves the edge at its heuristic tier rather than guessing.
 */
export async function findSymbolIdAt(
  connection: GraphDbConnection,
  filePath: string,
  line: number,
): Promise<string | null> {
  const rows = await (
    await connection.run(
      `
        SELECT s.id AS id
        FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE f.path = $path
          AND s.range.start_line = $line
        LIMIT 2
      `,
      { path: filePath, line },
    )
  ).getRowObjectsJS();

  if (rows.length !== 1) return null; // no match, or ambiguous — don't guess
  return String(rows[0]!.id);
}

/**
 * Persist precise resolutions: set `target_id` and stamp
 * `metadata.resolution='precise'` (confidence 1.0) for each edge, in one
 * transaction. Idempotent — re-applying the same resolution is a no-op upgrade.
 * Returns the number of edges updated.
 */
export async function persistPreciseEdges(
  connection: GraphDbConnection,
  resolutions: readonly PreciseResolution[],
): Promise<number> {
  if (resolutions.length === 0) return 0;

  await runInTransaction(connection, async () => {
    for (const { edgeId, targetId } of resolutions) {
      await connection.run(
        `
          UPDATE edge
          SET target_id = $target_id,
              metadata = json_merge_patch(
                metadata,
                '{"resolution":"precise","confidence":1.0}'
              )
          WHERE id = $edge_id
        `,
        { target_id: targetId, edge_id: edgeId },
      );
    }
  });

  return resolutions.length;
}
