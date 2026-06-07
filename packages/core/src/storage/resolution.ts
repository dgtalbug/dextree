import type { GraphDbConnection } from "./db.js";
import { metaPath } from "./edgeMetadata.js";

/**
 * SQL post-pass that resolves source_id and target_id for extractor-emitted
 * relational edges (CALLS, INHERITS, INSTANTIATES) after the symbols and edges
 * for `fileId` have been inserted.
 *
 * Why this is needed: relational extractors cannot know the symbol UUIDs minted
 * for definitions (every symbol gets a random uuidv4). Instead they write a
 * stable `source_fqn` (e.g. `"src/foo.ts:MyClass"`) and a target-name key
 * (`callee_name` / `parent_name` / `class_name`) into edge metadata. This step
 * resolves them against the just-written `symbol` rows.
 *
 * Step 1 — source_id: all three kinds have `source_fqn` in metadata. Edges
 * whose source_id still equals the file UUID placeholder are updated to the
 * matching symbol's id. Falls back to file-level id (via COALESCE) when the
 * call/instantiation is at module scope.
 *
 * Step 2 — target_id: the per-kind metadata key names the target symbol. Same-
 * file targets are resolved immediately; cross-file targets remain null (pass-2).
 */
export async function resolveCallEdgeSymbols(
  connection: GraphDbConnection,
  fileId: string,
): Promise<void> {
  const RELATIONAL_KINDS = `('CALLS', 'INHERITS', 'INSTANTIATES', 'IMPLEMENTS', 'REFERENCES', 'RE_EXPORTS')`;

  // Step 1: source_id → actual symbol id, keyed by source_fqn (all kinds share this)
  await connection.run(
    `
      UPDATE edge
      SET source_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.fqn = json_extract_string(edge.metadata, ${metaPath("sourceFqn")})
          LIMIT 1
        ),
        source_id
      )
      WHERE kind IN ${RELATIONAL_KINDS}
        AND source_id = $file_id
    `,
    { file_id: fileId },
  );

  // Step 2a (CALLS): target_id → same-file symbol by callee_name
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, ${metaPath("calleeName")})
            AND s.kind IN ('function', 'method', 'class')
          LIMIT 1
        ),
        target_id
      )
      WHERE kind = 'CALLS'
        AND target_id IS NULL
        AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: fileId },
  );

  // Step 2b (INHERITS): target_id → same-file class by parent_name
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, ${metaPath("parentName")})
            AND s.kind = 'class'
          LIMIT 1
        ),
        target_id
      )
      WHERE kind = 'INHERITS'
        AND target_id IS NULL
        AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: fileId },
  );

  // Step 2c (INSTANTIATES): target_id → same-file class by class_name
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, ${metaPath("className")})
            AND s.kind = 'class'
          LIMIT 1
        ),
        target_id
      )
      WHERE kind = 'INSTANTIATES'
        AND target_id IS NULL
        AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: fileId },
  );

  // Step 2d (IMPLEMENTS): target_id → same-file interface (or class for the
  // JS pattern where an interface is implemented via a class shape) by
  // interface_name.
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, ${metaPath("interfaceName")})
            AND s.kind IN ('interface', 'class')
          LIMIT 1
        ),
        target_id
      )
      WHERE kind = 'IMPLEMENTS'
        AND target_id IS NULL
        AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: fileId },
  );

  // Step 2e (REFERENCES): target_id → same-file symbol by referenced_name
  // (type usage etc.). Cross-file references resolve in the workspace pass.
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, ${metaPath("referencedName")})
          LIMIT 1
        ),
        target_id
      )
      WHERE kind = 'REFERENCES'
        AND target_id IS NULL
        AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: fileId },
  );

  await stampResolutionTier(connection);
}

/**
 * Stamp every relational edge with an explicit resolution tier + confidence so a
 * consumer can distinguish a real target from a guess (RULE-ARCH-010). Same-file
 * + cross-file name resolution is the `heuristic` tier; the precise tier (the
 * user's LSP) is applied later, by the host, and overrides this. Edges still
 * without a target are `unresolved`. Idempotent — re-running only upgrades the
 * tier field, never the target.
 */
export async function stampResolutionTier(connection: GraphDbConnection): Promise<void> {
  // RE_EXPORTS is path-based (resolved at query time like IMPORTS), so it is not
  // tier-stamped here — it gets the 'structural' tier below.
  const RELATIONAL_KINDS = `('CALLS', 'INHERITS', 'INSTANTIATES', 'IMPLEMENTS', 'REFERENCES')`;
  // Resolved → heuristic (unless already marked precise by a higher tier).
  await connection.run(
    `
      UPDATE edge
      SET metadata = json_merge_patch(
        metadata,
        '{"resolution":"heuristic","confidence":0.6}'
      )
      WHERE kind IN ${RELATIONAL_KINDS}
        AND target_id IS NOT NULL
        AND COALESCE(json_extract_string(metadata, '$.resolution'), '') <> 'precise'
    `,
  );
  // Unresolved → explicit unresolved tier (never silently target-less).
  await connection.run(
    `
      UPDATE edge
      SET metadata = json_merge_patch(
        metadata,
        '{"resolution":"unresolved","confidence":0.0}'
      )
      WHERE kind IN ${RELATIONAL_KINDS}
        AND target_id IS NULL
        AND COALESCE(json_extract_string(metadata, '$.resolution'), '') NOT IN ('precise', 'heuristic')
    `,
  );
  // Structural / path-resolved edges (DEFINES, CONTAINS, RE_EXPORTS) are facts
  // resolved structurally or at query time, not heuristic guesses — tag them
  // 'structural' so coverage reporting has no 'unspecified' rows.
  await connection.run(
    `
      UPDATE edge
      SET metadata = json_merge_patch(
        metadata,
        '{"resolution":"structural","confidence":1.0}'
      )
      WHERE kind IN ('DEFINES', 'CONTAINS', 'RE_EXPORTS')
        AND COALESCE(json_extract_string(metadata, '$.resolution'), '') = ''
    `,
  );
}

/**
 * Workspace-wide cross-file edge resolution pass.
 *
 * Called once after all files in a workspace have been indexed. The per-file
 * `resolveCallEdgeSymbols` pass already resolved same-file targets; this pass
 * resolves edges whose target still lives in a *different* file that was
 * indexed later in the batch.
 *
 * For each relational kind (CALLS, INHERITS, INSTANTIATES) that still has
 * `target_id = NULL`, we look up the target symbol by name across all symbols
 * in the workspace. On name collision we prefer symbols in the same file as
 * the source (already done in per-file pass) and fall back to workspace-wide
 * first-match. This is a pass-1 heuristic; pass-2 (LSP) will refine it.
 *
 * The `workspaceRoot` parameter is used only to scope the UPDATE to the
 * workspace's own symbols (not symbols from other indexed workspaces).
 */
export async function resolveWorkspaceCrossFileEdges(
  connection: GraphDbConnection,
  workspaceRoot: string,
): Promise<void> {
  const prefix = workspaceRoot.endsWith("/") ? workspaceRoot : `${workspaceRoot}/`;
  const params = { workspace_root: workspaceRoot, workspace_prefix: `${prefix}%` };

  // Resolve CALLS: callee_name → any matching function/method/class in workspace
  await connection.run(
    `
      UPDATE edge
      SET target_id = (
        SELECT s.id FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE s.name = json_extract_string(edge.metadata, ${metaPath("calleeName")})
          AND s.kind IN ('function', 'method', 'class')
          AND (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
        ORDER BY s.id
        LIMIT 1
      )
      WHERE kind = 'CALLS'
        AND target_id IS NULL
        AND source_id IN (
          SELECT s2.id FROM symbol s2
          INNER JOIN file f2 ON f2.id = s2.file_id
          WHERE f2.path = $workspace_root OR f2.path LIKE $workspace_prefix
        )
    `,
    params,
  );

  // Resolve INHERITS: parent_name → any matching class in workspace
  await connection.run(
    `
      UPDATE edge
      SET target_id = (
        SELECT s.id FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE s.name = json_extract_string(edge.metadata, ${metaPath("parentName")})
          AND s.kind = 'class'
          AND (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
        ORDER BY s.id
        LIMIT 1
      )
      WHERE kind = 'INHERITS'
        AND target_id IS NULL
        AND source_id IN (
          SELECT s2.id FROM symbol s2
          INNER JOIN file f2 ON f2.id = s2.file_id
          WHERE f2.path = $workspace_root OR f2.path LIKE $workspace_prefix
        )
    `,
    params,
  );

  // Resolve INSTANTIATES: class_name → any matching class in workspace
  await connection.run(
    `
      UPDATE edge
      SET target_id = (
        SELECT s.id FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE s.name = json_extract_string(edge.metadata, ${metaPath("className")})
          AND s.kind = 'class'
          AND (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
        ORDER BY s.id
        LIMIT 1
      )
      WHERE kind = 'INSTANTIATES'
        AND target_id IS NULL
        AND source_id IN (
          SELECT s2.id FROM symbol s2
          INNER JOIN file f2 ON f2.id = s2.file_id
          WHERE f2.path = $workspace_root OR f2.path LIKE $workspace_prefix
        )
    `,
    params,
  );

  // Resolve IMPLEMENTS: interface_name → any matching interface (or class
  // used as an interface) in the workspace.
  await connection.run(
    `
      UPDATE edge
      SET target_id = (
        SELECT s.id FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE s.name = json_extract_string(edge.metadata, ${metaPath("interfaceName")})
          AND s.kind IN ('interface', 'class')
          AND (f.path = $workspace_root OR f.path LIKE $workspace_prefix)
        ORDER BY s.id
        LIMIT 1
      )
      WHERE kind = 'IMPLEMENTS'
        AND target_id IS NULL
        AND source_id IN (
          SELECT s2.id FROM symbol s2
          INNER JOIN file f2 ON f2.id = s2.file_id
          WHERE f2.path = $workspace_root OR f2.path LIKE $workspace_prefix
        )
    `,
    params,
  );

  // Re-stamp tiers now that cross-file targets are filled in.
  await stampResolutionTier(connection);
}
