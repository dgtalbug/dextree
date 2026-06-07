import type { GraphDbConnection } from "./db.js";
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
import { resolveCallEdgeSymbols } from "./resolution.js";

export { stampResolutionTier, resolveWorkspaceCrossFileEdges } from "./resolution.js";
export { synthesizeFolderTree } from "./folderTree.js";

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
  connection: GraphDbConnection,
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
  connection: GraphDbConnection,
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
  // Clear annotation rows whose parent symbol is about to be dropped so the
  // table never carries dangling rows after a reindex.
  await connection.run(
    "DELETE FROM annotation WHERE parent_symbol_id IN (SELECT id FROM symbol WHERE file_id = $file_id)",
    { file_id: existingFileId },
  );
  await connection.run("DELETE FROM symbol WHERE file_id = $file_id", {
    file_id: existingFileId,
  });
}

async function insertFile(connection: GraphDbConnection, input: ExtractedIndexData): Promise<void> {
  // _schema_version, is_core, fan_in, tags, labels, metadata, last_modified,
  // last_author, change_count_30d are omitted from the column list — they take
  // their schema-defined default values. fan_in/is_core are populated later by
  // `recomputeGraphHealth`; the rest stay at their defaults until git or
  // diagnostics fill them in.
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

async function updateFile(connection: GraphDbConnection, input: ExtractedIndexData): Promise<void> {
  // Update only the columns that change when a file is re-indexed (path metadata,
  // size, hash, last_indexed). is_core, fan_in, tags, labels, metadata, and the
  // git-derived columns are deliberately NOT reset: they're owned by other
  // subsystems (diagnostics, git, graph health) and a reindex should preserve
  // their state.
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
  connection: GraphDbConnection,
  symbol: StoredSymbol,
  classification: SymbolClassificationRecord = DEFAULT_CLASSIFICATION,
): Promise<void> {
  // _schema_version, fan_in, is_core are omitted — column defaults handle them.
  // The pass-2 enrichment columns (visibility, signature, return_type, etc.) are
  // also omitted; they're nullable and stay NULL until LSP enrichment runs.
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
  connection: GraphDbConnection,
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
  connection: GraphDbConnection,
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
  connection: GraphDbConnection,
  edges: readonly EdgeRow[],
): Promise<void> {
  // Generic insert path for extractor-emitted edges (e.g. `CALLS` rows).
  // Metadata is serialized as JSON via `json` cast.
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

export async function replaceFileGraph(
  connection: GraphDbConnection,
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
 * Persist extractor-emitted annotation rows into the existing `annotation`
 * table. Rows missing a valid `parentSymbolId` (e.g. when the extractor could
 * not resolve an enclosing symbol) are silently skipped — the table has a NOT
 * NULL FK to `symbol`, and extractors must not invent synthetic targets.
 */
async function insertAnnotations(
  connection: GraphDbConnection,
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
 * Replace all workspace_framework rows with the supplied list, atomically.
 * Mirrors the replaceFileGraph pattern: DELETE all, INSERT new, in one transaction.
 * Empty input clears the table (workspace has no detected frameworks).
 */
export async function replaceWorkspaceFrameworks(
  connection: GraphDbConnection,
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
  connection: GraphDbConnection,
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
