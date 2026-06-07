import type { GraphDbConnection } from "../storage/db.js";

import type { CoverageReport, CoverageRow } from "../types.js";

export type { CoverageReport, CoverageRow };

/**
 * Relation-coverage metric: edges by kind and resolution tier, with the
 * resolved/total split, so index quality is observable rather than assumed. The
 * tier comes from `metadata.resolution` (stamped during resolution);
 * `precise`/`heuristic` count as resolved, `unresolved` does not.
 */
export async function getCoverageReport(connection: GraphDbConnection): Promise<CoverageReport> {
  const reader = await connection.run(
    `
      SELECT
        kind,
        COALESCE(json_extract_string(metadata, '$.resolution'), 'unspecified') AS tier,
        COUNT(*) AS total,
        COUNT(target_id) AS resolved
      FROM edge
      GROUP BY kind, tier
      ORDER BY kind, tier
    `,
  );
  const raw = await reader.getRowObjects();

  const rows: CoverageRow[] = raw.map((r) => ({
    kind: String(r.kind),
    tier: String(r.tier),
    total: Number(r.total),
    resolved: Number(r.resolved),
  }));

  const totalEdges = rows.reduce((sum, r) => sum + r.total, 0);
  const resolvedEdges = rows.reduce((sum, r) => sum + r.resolved, 0);

  return {
    rows,
    totalEdges,
    resolvedEdges,
    resolvedRatio: totalEdges === 0 ? 0 : resolvedEdges / totalEdges,
  };
}
