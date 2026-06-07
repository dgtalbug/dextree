import type { GraphDbConnection, GraphDbValue } from "../storage/db.js";

import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  NeighborhoodOptions,
  NeighborhoodResult,
} from "../types.js";

export type { NeighborhoodOptions, NeighborhoodResult };

const DEFAULT_MAX_NODES = 5000;

/**
 * In-store node-scoped traversal: given a node, return its edges and the nodes
 * they reach, outward to the requested depth — resolved with a recursive SQL walk
 * over the adjacency-indexed `edge` table, NOT by materializing the whole graph in
 * memory. This is the "given a node, see all its edges and edge-children to the
 * leaf" capability. Cycle-guarded (a visited set in the CTE) so cyclic graphs
 * terminate; `truncated` signals the depth/size cap was hit.
 */
export async function neighborhood(
  connection: GraphDbConnection,
  nodeId: string,
  options: NeighborhoodOptions,
): Promise<NeighborhoodResult> {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const depth = Math.max(1, options.depth);
  const kinds = options.edgeKinds ?? [];

  // Direction → which endpoint we follow. "both" walks the edge in either
  // orientation. The recursive CTE carries a visited-path string to stop cycles.
  const kindFilter =
    kinds.length > 0 ? `AND e.kind IN (${kinds.map((_, i) => `$k${i}`).join(", ")})` : "";

  const params: Record<string, GraphDbValue> = { seed: nodeId, max_depth: depth };
  kinds.forEach((k, i) => {
    params[`k${i}`] = k;
  });

  // Build the step join per direction. We collect edges (id, source, target,
  // kind) plus the depth at which each was discovered.
  const stepCondition =
    options.direction === "out"
      ? "e.source_id = frontier.node_id"
      : options.direction === "in"
        ? "e.target_id = frontier.node_id"
        : "(e.source_id = frontier.node_id OR e.target_id = frontier.node_id)";

  const nextNode =
    options.direction === "out"
      ? "e.target_id"
      : options.direction === "in"
        ? "e.source_id"
        : "CASE WHEN e.source_id = frontier.node_id THEN e.target_id ELSE e.source_id END";

  const reader = await connection.run(
    `
      WITH RECURSIVE frontier(node_id, depth, path) AS (
        SELECT CAST($seed AS VARCHAR), 0, CAST($seed AS VARCHAR)
        UNION ALL
        SELECT ${nextNode}, frontier.depth + 1,
               frontier.path || '>' || ${nextNode}
        FROM frontier
        JOIN edge e ON ${stepCondition} ${kindFilter}
        WHERE frontier.depth < $max_depth
          AND ${nextNode} IS NOT NULL
          AND position(${nextNode} IN frontier.path) = 0
      )
      SELECT DISTINCT node_id, MIN(depth) AS depth
      FROM frontier
      GROUP BY node_id
      ORDER BY depth
      LIMIT ${maxNodes + 1}
    `,
    params,
  );
  const reached = await reader.getRowObjects();

  const truncated = reached.length > maxNodes;
  const nodeIds = reached.slice(0, maxNodes).map((r) => String(r.node_id));

  if (nodeIds.length === 0) {
    return { nodes: [], edges: [], truncated: false };
  }

  const edges = await edgesAmong(connection, nodeIds, kinds);
  const nodes = await hydrateNodes(connection, nodeIds);
  return { nodes, edges, truncated };
}

/** All edges whose endpoints are both within the reached set (and pass the kind filter). */
async function edgesAmong(
  connection: GraphDbConnection,
  nodeIds: string[],
  kinds: readonly GraphEdgeKind[],
): Promise<GraphEdge[]> {
  const idList = nodeIds.map((_, i) => `$n${i}`).join(", ");
  const params: Record<string, GraphDbValue> = {};
  nodeIds.forEach((id, i) => {
    params[`n${i}`] = id;
  });
  const kindFilter =
    kinds.length > 0 ? `AND kind IN (${kinds.map((_, i) => `$ek${i}`).join(", ")})` : "";
  kinds.forEach((k, i) => {
    params[`ek${i}`] = k;
  });

  const reader = await connection.run(
    `
      SELECT id, source_id, target_id, kind
      FROM edge
      WHERE source_id IN (${idList})
        AND target_id IN (${idList})
        ${kindFilter}
    `,
    params,
  );
  const rows = await reader.getRowObjects();
  return rows.map((r) => ({
    id: String(r.id),
    source: String(r.source_id),
    target: String(r.target_id),
    kind: String(r.kind) as GraphEdgeKind,
  }));
}

/** Hydrate node ids into GraphNodes from the folder/file/symbol tables. */
async function hydrateNodes(
  connection: GraphDbConnection,
  nodeIds: string[],
): Promise<GraphNode[]> {
  const idList = nodeIds.map((_, i) => `$h${i}`).join(", ");
  const params: Record<string, GraphDbValue> = {};
  nodeIds.forEach((id, i) => {
    params[`h${i}`] = id;
  });

  const nodes: GraphNode[] = [];

  const fileReader = await connection.run(
    `SELECT id, relative_path FROM file WHERE id IN (${idList})`,
    params,
  );
  for (const r of await fileReader.getRowObjects()) {
    nodes.push({
      id: String(r.id),
      type: "file",
      label: String(r.relative_path),
      filePath: String(r.relative_path),
      startLine: 0,
    });
  }

  const symReader = await connection.run(
    `SELECT s.id, s.name, s.kind, f.relative_path, s.range
     FROM symbol s JOIN file f ON f.id = s.file_id
     WHERE s.id IN (${idList})`,
    params,
  );
  for (const r of await symReader.getRowObjects()) {
    const range = r.range as { start_line?: number } | null;
    const node: GraphNode = {
      id: String(r.id),
      type: "symbol",
      label: String(r.name),
      filePath: String(r.relative_path),
      startLine: Number(range?.start_line ?? 0),
    };
    const kind = r.kind as GraphNode["symbolKind"] | null | undefined;
    if (kind != null) node.symbolKind = kind;
    nodes.push(node);
  }

  // Folder nodes (phase 5). The folder table may not exist on older indexes; the
  // caller's migration adds it, so a missing-table error degrades to no folders.
  try {
    const folderReader = await connection.run(
      `SELECT id, path FROM folder WHERE id IN (${idList})`,
      params,
    );
    for (const r of await folderReader.getRowObjects()) {
      nodes.push({
        id: String(r.id),
        type: "folder",
        label: String(r.path),
        filePath: String(r.path),
        startLine: 0,
      });
    }
  } catch {
    // No folder table — fine, folders simply aren't part of this index yet.
  }

  return nodes;
}
