import { createHash } from "node:crypto";

import type { DuckDBConnection } from "@duckdb/node-api";
import { v4 as uuidv4 } from "uuid";

import type { EdgeRow } from "../extractors/types.js";
import type {
  ExtractedImportRef,
  ExtractedIndexData,
  FrameworkDetectionSource,
  StoredSymbol,
  SymbolClassificationRecord,
} from "../types.js";
import { runInTransaction } from "./db.js";

export interface DetectedFrameworkRow {
  frameworkName: string;
  detectionSource: FrameworkDetectionSource;
  confidence: number;
}

function rangeParams(symbol: StoredSymbol): Record<string, number> {
  return {
    start_line: symbol.range.startLine,
    start_col: symbol.range.startCol,
    end_line: symbol.range.endLine,
    end_col: symbol.range.endCol,
  };
}

function importRangeParams(importRef: ExtractedImportRef): Record<string, number> {
  return {
    start_line: importRef.range.startLine,
    start_col: importRef.range.startCol,
    end_line: importRef.range.endLine,
    end_col: importRef.range.endCol,
  };
}

async function findExistingFileId(
  connection: DuckDBConnection,
  absolutePath: string,
): Promise<string | null> {
  const rows = await (
    await connection.run("SELECT id FROM file WHERE path = $path LIMIT 1", {
      path: absolutePath,
    })
  ).getRowObjectsJS();

  const fileId = rows[0]?.id;
  return typeof fileId === "string" ? fileId : null;
}

async function deleteExistingRows(
  connection: DuckDBConnection,
  existingFileId: string,
): Promise<void> {
  // Two separate statements because DuckDB's named-parameter binding fails
  // when the same $name appears more than once in a single prepared statement
  // ("Failed to retrieve bind parameter index"). Splitting avoids the trap.
  // edge.source_id covers DEFINES and IMPORTS edges originating from this file.
  await connection.run("DELETE FROM edge WHERE source_id = $file_id", {
    file_id: existingFileId,
  });
  await connection.run(
    "DELETE FROM edge WHERE target_id IN (SELECT id FROM symbol WHERE file_id = $file_id)",
    { file_id: existingFileId },
  );
  // Slice 031 US3 — clear annotation rows whose parent symbol is about to be
  // dropped so the table never carries dangling rows after a reindex.
  await connection.run(
    "DELETE FROM annotation WHERE parent_symbol_id IN (SELECT id FROM symbol WHERE file_id = $file_id)",
    { file_id: existingFileId },
  );
  await connection.run("DELETE FROM symbol WHERE file_id = $file_id", {
    file_id: existingFileId,
  });
}

async function insertFile(connection: DuckDBConnection, input: ExtractedIndexData): Promise<void> {
  // _schema_version, is_core, fan_in, tags, labels, metadata, last_modified,
  // last_author, change_count_30d are omitted from the column list — they take
  // their schema-defined default values. fan_in/is_core are populated later by
  // `recomputeGraphHealth` (S11.7); the rest stay at their defaults until git
  // (S10) or diagnostics (S9) fill them in.
  await connection.run(
    `
      INSERT INTO file (
        id,
        path,
        relative_path,
        language,
        loc,
        hash,
        last_indexed
      ) VALUES (
        $id,
        $path,
        $relative_path,
        $language,
        $loc,
        $hash,
        CURRENT_TIMESTAMP
      )
    `,
    {
      id: input.file.id,
      path: input.file.path,
      relative_path: input.file.relativePath,
      language: input.file.language,
      loc: input.file.loc,
      hash: input.file.hash,
    },
  );
}

async function updateFile(connection: DuckDBConnection, input: ExtractedIndexData): Promise<void> {
  // Update only the columns that change when a file is re-indexed (path metadata,
  // size, hash, last_indexed). is_core, fan_in, tags, labels, metadata, and the
  // git-derived columns are deliberately NOT reset: they're owned by other
  // subsystems (S9 diagnostics, S10 git, S11.7 graph health) and a reindex
  // should preserve their state. Closes audit finding M7.
  await connection.run(
    `
      UPDATE file
      SET
        relative_path = $relative_path,
        language = $language,
        loc = $loc,
        hash = $hash,
        last_indexed = CURRENT_TIMESTAMP
      WHERE id = $id
    `,
    {
      id: input.file.id,
      relative_path: input.file.relativePath,
      language: input.file.language,
      loc: input.file.loc,
      hash: input.file.hash,
    },
  );
}

const DEFAULT_CLASSIFICATION: SymbolClassificationRecord = {
  entryKind: "unclassified",
  archLayer: "unknown",
};

async function insertSymbol(
  connection: DuckDBConnection,
  symbol: StoredSymbol,
  classification: SymbolClassificationRecord = DEFAULT_CLASSIFICATION,
): Promise<void> {
  // _schema_version, fan_in, is_core are omitted — column defaults handle them.
  // The pass-2 enrichment columns (visibility, signature, return_type, etc.) are
  // also omitted; they're nullable and stay NULL until LSP enrichment (S8) runs.
  //
  // entry_kind and arch_layer are always written explicitly so migrated v5→v6
  // databases (where the columns are bare-added without DEFAULT) get the same
  // initial state as fresh ones.
  await connection.run(
    `
      INSERT INTO symbol (
        id,
        fqn,
        name,
        kind,
        file_id,
        range,
        language,
        entry_kind,
        arch_layer,
        enclosing_symbol_id
      ) VALUES (
        $id,
        $fqn,
        $name,
        $kind,
        $file_id,
        struct_pack(
          start_line := $start_line,
          start_col := $start_col,
          end_line := $end_line,
          end_col := $end_col
        ),
        $language,
        $entry_kind,
        $arch_layer,
        $enclosing_symbol_id
      )
    `,
    {
      id: symbol.id,
      fqn: symbol.fqn,
      name: symbol.name,
      kind: symbol.kind,
      file_id: symbol.fileId,
      language: symbol.language,
      ...rangeParams(symbol),
      entry_kind: classification.entryKind,
      arch_layer: classification.archLayer,
      enclosing_symbol_id: symbol.enclosingSymbolId ?? null,
    },
  );
}

async function insertDefinesEdges(
  connection: DuckDBConnection,
  input: ExtractedIndexData,
): Promise<void> {
  for (const symbol of input.symbols) {
    await connection.run(
      `
        INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
        VALUES ($id, $source_id, $target_id, 'DEFINES', NULL, '{}'::JSON)
      `,
      {
        id: uuidv4(),
        source_id: input.file.id,
        target_id: symbol.id,
      },
    );
  }
}

async function insertImportRefs(
  connection: DuckDBConnection,
  input: ExtractedIndexData,
): Promise<void> {
  // Post-v3: imports are stored as `edge` rows with kind='IMPORTS'. The sidecar
  // `import_ref` table is dropped by migration 003. Per-file metadata (import_path,
  // imported_symbol, range, language) lives in edge.metadata JSON. The target_id
  // is left NULL at write time; subgraph queries resolve target file_id via JOIN
  // on metadata.import_path → file.relative_path.
  for (const importRef of input.imports) {
    await connection.run(
      `
        INSERT INTO edge (
          id,
          source_id,
          target_id,
          kind,
          weight,
          metadata
        ) VALUES (
          $id,
          $file_id,
          NULL,
          'IMPORTS',
          NULL,
          json_object(
            'import_path', $import_path,
            'imported_symbol', $imported_symbol,
            'import_range', struct_pack(
              start_line := $start_line,
              start_col := $start_col,
              end_line := $end_line,
              end_col := $end_col
            ),
            'language', $language
          )
        )
      `,
      {
        id: importRef.id,
        file_id: importRef.fileId,
        import_path: importRef.importPath,
        imported_symbol: importRef.importedSymbol,
        language: importRef.language,
        ...importRangeParams(importRef),
      },
    );
  }
}

async function insertExtraEdges(
  connection: DuckDBConnection,
  edges: readonly EdgeRow[],
): Promise<void> {
  // Generic insert path for extractor-emitted edges (e.g. naive `CALLS` rows
  // from `NaiveCallExtractor`). Metadata is serialized as JSON via `json` cast.
  for (const edge of edges) {
    await connection.run(
      `
        INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
        VALUES ($id, $source_id, $target_id, $kind, $weight, $metadata::JSON)
      `,
      {
        id: edge.id,
        source_id: edge.sourceId,
        target_id: edge.targetId,
        kind: edge.kind,
        weight: edge.weight ?? null,
        metadata: JSON.stringify(edge.metadata ?? {}),
      },
    );
  }
}

function remapExtraEdges(
  edges: readonly EdgeRow[],
  staleFileId: string,
  resolvedFileId: string,
): EdgeRow[] {
  // When the indexer re-uses an existing file id, source/target references the
  // extractor minted against the would-be-fresh file id must be retargeted.
  if (staleFileId === resolvedFileId) {
    return edges as EdgeRow[];
  }
  return edges.map((edge) => ({
    ...edge,
    sourceId: edge.sourceId === staleFileId ? resolvedFileId : edge.sourceId,
    targetId: edge.targetId === staleFileId ? resolvedFileId : edge.targetId,
  }));
}

/**
 * SQL post-pass that resolves source_id and target_id for extractor-emitted
 * relational edges (CALLS, INHERITS, INSTANTIATES) after the symbols and edges
 * for `fileId` have been inserted.
 *
 * Why this is needed: NaiveCallExtractor and ClassRelationExtractor cannot know
 * the symbol UUIDs minted by BaselineTsJsExtractor (both use random uuidv4).
 * Instead they write a stable `source_fqn` (e.g. `"src/foo.ts:MyClass"`) and a
 * target-name key (`callee_name` / `parent_name` / `class_name`) into edge
 * metadata. This step resolves them against the just-written `symbol` rows.
 *
 * Step 1 — source_id: all three kinds have `source_fqn` in metadata. Edges
 * whose source_id still equals the file UUID placeholder are updated to the
 * matching symbol's id. Falls back to file-level id (via COALESCE) when the
 * call/instantiation is at module scope.
 *
 * Step 2 — target_id: the per-kind metadata key names the target symbol. Same-
 * file targets are resolved immediately; cross-file targets remain null (pass-2).
 */
async function resolveCallEdgeSymbols(connection: DuckDBConnection, fileId: string): Promise<void> {
  const RELATIONAL_KINDS = `('CALLS', 'INHERITS', 'INSTANTIATES', 'IMPLEMENTS')`;

  // Step 1: source_id → actual symbol id, keyed by source_fqn (all kinds share this)
  await connection.run(
    `
      UPDATE edge
      SET source_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.fqn = json_extract_string(edge.metadata, '$.source_fqn')
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
            AND s.name = json_extract_string(edge.metadata, '$.callee_name')
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
            AND s.name = json_extract_string(edge.metadata, '$.parent_name')
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
            AND s.name = json_extract_string(edge.metadata, '$.class_name')
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
  // interface_name. Slice 031 US2.
  await connection.run(
    `
      UPDATE edge
      SET target_id = COALESCE(
        (
          SELECT s.id FROM symbol s
          WHERE s.file_id = $file_id
            AND s.name = json_extract_string(edge.metadata, '$.interface_name')
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
export async function stampResolutionTier(connection: DuckDBConnection): Promise<void> {
  const RELATIONAL_KINDS = `('CALLS', 'INHERITS', 'INSTANTIATES', 'IMPLEMENTS')`;
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
  // Structural edges (DEFINES, CONTAINS) are always-resolved facts, not guesses —
  // tag them 'structural' so coverage reporting has no 'unspecified' rows.
  await connection.run(
    `
      UPDATE edge
      SET metadata = json_merge_patch(
        metadata,
        '{"resolution":"structural","confidence":1.0}'
      )
      WHERE kind IN ('DEFINES', 'CONTAINS')
        AND COALESCE(json_extract_string(metadata, '$.resolution'), '') = ''
    `,
  );
}

export async function replaceFileGraph(
  connection: DuckDBConnection,
  input: ExtractedIndexData,
  extraEdges: readonly EdgeRow[] = [],
  classifications: ReadonlyMap<string, SymbolClassificationRecord> = new Map(),
  annotations: readonly unknown[] = [],
): Promise<void> {
  await runInTransaction(connection, async () => {
    const existingFileId = await findExistingFileId(connection, input.file.path);
    const resolvedFileId = existingFileId ?? input.file.id;
    const normalizedInput: ExtractedIndexData = {
      file: {
        ...input.file,
        id: resolvedFileId,
      },
      symbols: input.symbols.map((symbol) => ({
        ...symbol,
        fileId: resolvedFileId,
      })),
      imports: input.imports.map((importRef) => ({
        ...importRef,
        fileId: resolvedFileId,
      })),
    };
    const normalizedExtraEdges = remapExtraEdges(extraEdges, input.file.id, resolvedFileId);
    const validSymbolIds = new Set(normalizedInput.symbols.map((s) => s.id));

    if (existingFileId !== null) {
      await deleteExistingRows(connection, existingFileId);
      await updateFile(connection, normalizedInput);
    } else {
      await insertFile(connection, normalizedInput);
    }

    for (const symbol of normalizedInput.symbols) {
      await insertSymbol(connection, symbol, classifications.get(symbol.id));
    }

    await insertImportRefs(connection, normalizedInput);
    await insertDefinesEdges(connection, normalizedInput);
    await insertExtraEdges(connection, normalizedExtraEdges);
    await resolveCallEdgeSymbols(connection, resolvedFileId);
    await insertAnnotations(connection, annotations, validSymbolIds);
  });
}

interface AnnotationLikeRow {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  parentSymbolId: string;
  language: string;
  metadata?: Record<string, unknown>;
  range: { start_line: number; start_col: number; end_line: number; end_col: number };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAnnotationLikeRow(row: unknown): row is AnnotationLikeRow {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  const range = r["range"];
  if (typeof range !== "object" || range === null) return false;
  const rangeRow = range as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["name"] === "string" &&
    typeof r["parentSymbolId"] === "string" &&
    typeof r["language"] === "string" &&
    isFiniteNumber(rangeRow["start_line"]) &&
    isFiniteNumber(rangeRow["start_col"]) &&
    isFiniteNumber(rangeRow["end_line"]) &&
    isFiniteNumber(rangeRow["end_col"])
  );
}

/**
 * Persist annotation rows from {@link DecoratorExtractor} into the existing
 * `annotation` table. Rows missing a valid `parentSymbolId` (e.g. when the
 * extractor could not resolve an enclosing symbol) are silently skipped —
 * the table has a NOT NULL FK to `symbol`, and per slice 031 contract the
 * extractor must not invent synthetic targets. Slice 031 US3.
 */
async function insertAnnotations(
  connection: DuckDBConnection,
  annotations: readonly unknown[],
  validSymbolIds: ReadonlySet<string>,
): Promise<void> {
  for (const raw of annotations) {
    if (!isAnnotationLikeRow(raw)) continue;
    if (raw.parentSymbolId.length === 0) continue;
    if (!validSymbolIds.has(raw.parentSymbolId)) continue;
    await connection.run(
      `
        INSERT INTO annotation (
          id,
          name,
          args,
          range,
          parent_symbol_id,
          language,
          metadata
        ) VALUES (
          $id,
          $name,
          $args::JSON,
          struct_pack(
            start_line := $start_line,
            start_col := $start_col,
            end_line := $end_line,
            end_col := $end_col
          ),
          $parent_symbol_id,
          $language,
          $metadata::JSON
        )
      `,
      {
        id: raw.id,
        name: raw.name,
        args: JSON.stringify(raw.args ?? {}),
        start_line: raw.range.start_line,
        start_col: raw.range.start_col,
        end_line: raw.range.end_line,
        end_col: raw.range.end_col,
        parent_symbol_id: raw.parentSymbolId,
        language: raw.language,
        metadata: JSON.stringify(raw.metadata ?? {}),
      },
    );
  }
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
  connection: DuckDBConnection,
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
        WHERE s.name = json_extract_string(edge.metadata, '$.callee_name')
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
        WHERE s.name = json_extract_string(edge.metadata, '$.parent_name')
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
        WHERE s.name = json_extract_string(edge.metadata, '$.class_name')
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
  // used as an interface) in the workspace. Slice 031 US2.
  await connection.run(
    `
      UPDATE edge
      SET target_id = (
        SELECT s.id FROM symbol s
        INNER JOIN file f ON f.id = s.file_id
        WHERE s.name = json_extract_string(edge.metadata, '$.interface_name')
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

/** Deterministic folder id: stable across re-index so the tree doesn't reshuffle. */
function folderId(path: string): string {
  return `folder:${createHash("sha256").update(path, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * Synthesize `folder` nodes + `CONTAINS` edges from the indexed files' relative
 * paths, producing a connected root→folder→file tree. Deterministic ids (path
 * hash) keep re-indexing stable. Rebuilt wholesale each call (idempotent): clear
 * folders + CONTAINS, then re-derive from current files. Runs in finalize.
 */
export async function synthesizeFolderTree(connection: DuckDBConnection): Promise<void> {
  await runInTransaction(connection, async () => {
    await connection.run("DELETE FROM folder");
    await connection.run("DELETE FROM edge WHERE kind = 'CONTAINS'");

    const reader = await connection.run("SELECT id, relative_path FROM file");
    const files = await reader.getRowObjects();
    if (files.length === 0) return;

    const folders = new Map<string, { id: string; parent: string | null }>();
    const containsFileEdges: { folder: string; file: string }[] = [];

    for (const f of files) {
      const rel = String(f.relative_path);
      const parts = rel.split("/");
      parts.pop(); // drop the filename
      // Register every ancestor folder ("" = root), chaining parent links.
      let parentPath: string | null = null;
      let accum = "";
      // Root sentinel so top-level files attach to a single root node.
      const rootId = folderId("");
      if (!folders.has("")) folders.set("", { id: rootId, parent: null });
      parentPath = "";
      for (const part of parts) {
        accum = accum === "" ? part : `${accum}/${part}`;
        if (!folders.has(accum)) {
          folders.set(accum, { id: folderId(accum), parent: folders.get(parentPath!)!.id });
        }
        parentPath = accum;
      }
      containsFileEdges.push({ folder: folders.get(parentPath)!.id, file: String(f.id) });
    }

    for (const [path, info] of folders) {
      await connection.run(
        "INSERT INTO folder (id, path, parent_id) VALUES ($id, $path, $parent)",
        { id: info.id, path, parent: info.parent },
      );
      if (info.parent !== null) {
        await connection.run(
          "INSERT INTO edge (id, source_id, target_id, kind, metadata) VALUES ($id, $s, $t, 'CONTAINS', '{}')",
          { id: `contains:${info.parent}->${info.id}`, s: info.parent, t: info.id },
        );
      }
    }
    for (const e of containsFileEdges) {
      await connection.run(
        "INSERT INTO edge (id, source_id, target_id, kind, metadata) VALUES ($id, $s, $t, 'CONTAINS', '{}')",
        { id: `contains:${e.folder}->${e.file}`, s: e.folder, t: e.file },
      );
    }
  });
}

/**
 * Replace all workspace_framework rows with the supplied list, atomically.
 * Mirrors the replaceFileGraph pattern: DELETE all, INSERT new, in one transaction.
 * Empty input clears the table (workspace has no detected frameworks).
 */
export async function replaceWorkspaceFrameworks(
  connection: DuckDBConnection,
  rows: readonly DetectedFrameworkRow[],
): Promise<void> {
  await runInTransaction(connection, async () => {
    await connection.run("DELETE FROM workspace_framework");
    for (const row of rows) {
      await connection.run(
        `
          INSERT INTO workspace_framework (
            id, framework_name, detection_source, confidence, detected_at
          ) VALUES (
            $id, $framework_name, $detection_source, $confidence, CURRENT_TIMESTAMP
          )
        `,
        {
          id: uuidv4(),
          framework_name: row.frameworkName,
          detection_source: row.detectionSource,
          confidence: row.confidence,
        },
      );
    }
  });
}

/**
 * Update a single file row's framework attribution. NULL values are valid
 * (file does not belong to any detected framework). Re-applying the same
 * values is a no-op at the DB level.
 */
export async function setFileFramework(
  connection: DuckDBConnection,
  fileId: string,
  framework: string | null,
  role: string | null,
): Promise<void> {
  await connection.run(
    `
      UPDATE file
      SET framework = $framework, framework_role = $framework_role
      WHERE id = $id
    `,
    {
      id: fileId,
      framework,
      framework_role: role,
    },
  );
}
