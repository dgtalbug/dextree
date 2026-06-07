/**
 * Per-workspace DuckDB read summary for the workspace switcher.
 *
 * Opens a foreign DuckDB file in read-only mode to extract the single
 * `workspace_cache` row and the framework list — without running migrations
 * or mutating the file. Used by the extension host's workspace registry to
 * enumerate every previously indexed workspace.
 */

import { basename } from "node:path";

import { openReadOnlyDatabase } from "./adapters/duckdb.js";
import { getPresentEdgeKinds } from "../query/presentEdgeKinds.js";
import { getWorkspaceSubgraph } from "../query/subgraph.js";
import type { WorkspaceSubgraph } from "../types.js";

export interface WorkspaceIndexSummary {
  workspaceRoot: string;
  /** Directory basename of workspaceRoot. */
  name: string;
  indexedFileCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  /** ISO timestamp or null if never finalized. */
  lastIndexedAt: string | null;
  /** Detected framework names in alphabetical order (may be empty). */
  frameworks: readonly string[];
}

function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

function toIsoOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Opens the DuckDB file at `dbPath` in read-only mode and returns a summary of
 * the indexed workspace. Returns null if the file is missing, the workspace_cache
 * row is absent, or any I/O error occurs. The framework list degrades to `[]`
 * when the `workspace_framework` table is missing (an older index).
 *
 * Does NOT run migrations on the opened file — read-only access mode prevents
 * accidental schema mutation of foreign workspace DBs.
 */
export async function readWorkspaceIndexSummary(
  dbPath: string,
): Promise<WorkspaceIndexSummary | null> {
  try {
    const handle = await openReadOnlyDatabase(dbPath);
    const connection = handle.connection;

    try {
      const cacheRows = await (
        await connection.run(
          `
            SELECT
              workspace_root,
              CAST(last_successful_index_at AS VARCHAR) AS last_successful_index_at,
              indexed_file_count,
              graph_node_count,
              graph_edge_count
            FROM workspace_cache
            WHERE id = 1
            LIMIT 1
          `,
        )
      ).getRowObjectsJS();

      if (cacheRows.length === 0) return null;
      const cache = cacheRows[0] as Record<string, unknown>;
      const workspaceRoot = String(cache["workspace_root"]);

      let frameworks: string[] = [];
      try {
        const fwRows = await (
          await connection.run(
            `SELECT framework_name FROM workspace_framework ORDER BY framework_name`,
          )
        ).getRowObjectsJS();
        frameworks = fwRows.map((r) => String((r as Record<string, unknown>)["framework_name"]));
      } catch {
        // workspace_framework table absent on older DBs — degrade silently to []
      }

      return {
        workspaceRoot,
        name: basename(workspaceRoot),
        indexedFileCount: toNumber(cache["indexed_file_count"]),
        graphNodeCount: toNumber(cache["graph_node_count"]),
        graphEdgeCount: toNumber(cache["graph_edge_count"]),
        lastIndexedAt: toIsoOrNull(cache["last_successful_index_at"]),
        frameworks,
      };
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

/**
 * Result of `readWorkspaceGraph`: the workspace subgraph plus the present edge
 * kinds (the legend uses this set). Null is returned by the caller wrapper
 * when the foreign DB cannot be opened.
 */
export interface ForeignWorkspaceGraph {
  subgraph: WorkspaceSubgraph;
  presentEdgeKinds: readonly string[];
}

/**
 * Opens the DuckDB file at `dbPath` in read-only mode and returns the workspace
 * subgraph (nodes + edges + frameworks) plus the present edge kinds — the same
 * payload `Indexer.getWorkspaceSubgraph` produces for the active workspace.
 *
 * Returns null on any I/O or schema error so the caller can show a graceful
 * "could not open workspace" notification.
 */
export async function readWorkspaceGraph(
  dbPath: string,
  workspaceRoot: string,
): Promise<ForeignWorkspaceGraph | null> {
  try {
    const handle = await openReadOnlyDatabase(dbPath);
    try {
      const subgraph = await getWorkspaceSubgraph(handle.connection, workspaceRoot);
      const presentEdgeKinds = await getPresentEdgeKinds(handle.connection, workspaceRoot);
      return { subgraph, presentEdgeKinds };
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}
