import type { GraphDbConnection } from "./db.js";

import {
  SCHEMA_VERSION,
  type WorkspaceCacheIdentity,
  type WorkspaceCacheMetadata,
  type WorkspaceCacheValidation,
} from "../types.js";

const WORKSPACE_CACHE_ROW_ID = 1;

export interface WriteWorkspaceCacheSnapshotInput {
  identity: WorkspaceCacheIdentity;
  schemaVersion?: number;
  indexedFileCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
}

interface WorkspaceCacheRow {
  cache_key: string;
  workspace_root: string;
  repo_root: string | null;
  repo_remote: string | null;
  schema_version: number;
  last_successful_index_at: string | null;
  indexed_file_count: number;
  graph_node_count: number;
  graph_edge_count: number;
}

function toNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function toRow(value: Record<string, unknown>): WorkspaceCacheRow {
  return {
    cache_key: String(value.cache_key),
    workspace_root: String(value.workspace_root),
    repo_root: toStringOrNull(value.repo_root),
    repo_remote: toStringOrNull(value.repo_remote),
    schema_version: toNumber(value.schema_version),
    last_successful_index_at: toStringOrNull(value.last_successful_index_at),
    indexed_file_count: toNumber(value.indexed_file_count),
    graph_node_count: toNumber(value.graph_node_count),
    graph_edge_count: toNumber(value.graph_edge_count),
  };
}

function toMetadata(row: WorkspaceCacheRow): WorkspaceCacheMetadata {
  return {
    schemaVersion: row.schema_version,
    lastSuccessfulIndexAt: row.last_successful_index_at,
    indexedFileCount: row.indexed_file_count,
    graphNodeCount: row.graph_node_count,
    graphEdgeCount: row.graph_edge_count,
  };
}

function identityMatches(row: WorkspaceCacheRow, identity: WorkspaceCacheIdentity): boolean {
  if (row.cache_key !== identity.cacheKey || row.workspace_root !== identity.workspaceRoot) {
    return false;
  }

  if (identity.repoRoot !== null && row.repo_root !== null && row.repo_root !== identity.repoRoot) {
    return false;
  }

  if (
    identity.repoRemote !== null &&
    row.repo_remote !== null &&
    row.repo_remote !== identity.repoRemote
  ) {
    return false;
  }

  return true;
}

export async function writeWorkspaceCacheSnapshot(
  connection: GraphDbConnection,
  input: WriteWorkspaceCacheSnapshotInput,
): Promise<void> {
  const timestamp = new Date().toISOString();

  await connection.run(
    `
      INSERT INTO workspace_cache (
        id,
        cache_key,
        workspace_root,
        repo_root,
        repo_remote,
        schema_version,
        last_successful_index_at,
        indexed_file_count,
        graph_node_count,
        graph_edge_count,
        updated_at
      ) VALUES (
        $id,
        $cache_key,
        $workspace_root,
        $repo_root,
        $repo_remote,
        $schema_version,
        $last_successful_index_at,
        $indexed_file_count,
        $graph_node_count,
        $graph_edge_count,
        $updated_at
      )
      ON CONFLICT (id) DO UPDATE SET
        cache_key = EXCLUDED.cache_key,
        workspace_root = EXCLUDED.workspace_root,
        repo_root = EXCLUDED.repo_root,
        repo_remote = EXCLUDED.repo_remote,
        schema_version = EXCLUDED.schema_version,
        last_successful_index_at = EXCLUDED.last_successful_index_at,
        indexed_file_count = EXCLUDED.indexed_file_count,
        graph_node_count = EXCLUDED.graph_node_count,
        graph_edge_count = EXCLUDED.graph_edge_count,
        updated_at = EXCLUDED.updated_at
    `,
    {
      id: WORKSPACE_CACHE_ROW_ID,
      cache_key: input.identity.cacheKey,
      workspace_root: input.identity.workspaceRoot,
      repo_root: input.identity.repoRoot,
      repo_remote: input.identity.repoRemote,
      schema_version: input.schemaVersion ?? SCHEMA_VERSION,
      last_successful_index_at: timestamp,
      indexed_file_count: input.indexedFileCount,
      graph_node_count: input.graphNodeCount,
      graph_edge_count: input.graphEdgeCount,
      updated_at: timestamp,
    },
  );
}

export async function validateWorkspaceCache(
  connection: GraphDbConnection,
  identity: WorkspaceCacheIdentity,
): Promise<WorkspaceCacheValidation> {
  try {
    const rows = await (
      await connection.run(
        `
          SELECT
            cache_key,
            workspace_root,
            repo_root,
            repo_remote,
            schema_version,
            CAST(last_successful_index_at AS VARCHAR) AS last_successful_index_at,
            indexed_file_count,
            graph_node_count,
            graph_edge_count
          FROM workspace_cache
          WHERE id = $id
          LIMIT 1
        `,
        { id: WORKSPACE_CACHE_ROW_ID },
      )
    ).getRowObjectsJS();

    if (rows.length === 0) {
      return {
        status: "missing",
        identity,
        metadata: null,
      };
    }

    const row = toRow(rows[0] as Record<string, unknown>);
    const metadata = toMetadata(row);

    if (!identityMatches(row, identity)) {
      return {
        status: "invalid",
        identity,
        metadata,
        reason: "identity-mismatch",
      };
    }

    if (metadata.schemaVersion !== SCHEMA_VERSION) {
      return {
        status: "invalid",
        identity,
        metadata,
        reason: "schema-mismatch",
      };
    }

    if (
      metadata.lastSuccessfulIndexAt === null ||
      metadata.indexedFileCount <= 0 ||
      metadata.graphNodeCount <= 0
    ) {
      return {
        status: "empty",
        identity,
        metadata,
      };
    }

    return {
      status: "ready",
      identity,
      metadata,
    };
  } catch {
    return {
      status: "invalid",
      identity,
      metadata: null,
      reason: "unreadable",
    };
  }
}
