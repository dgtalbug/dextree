import type { DuckDBConnection } from "@duckdb/node-api";
import { v4 as uuidv4 } from "uuid";

import type { EdgeRow } from "../extractors/types.js";
import type { ExtractedImportRef, ExtractedIndexData, StoredSymbol } from "../types.js";
import { runInTransaction } from "./db.js";

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

async function insertSymbol(connection: DuckDBConnection, symbol: StoredSymbol): Promise<void> {
  // _schema_version, fan_in, is_core are omitted — column defaults handle them.
  // The pass-2 enrichment columns (visibility, signature, return_type, etc.) are
  // also omitted; they're nullable and stay NULL until LSP enrichment (S8) runs.
  await connection.run(
    `
      INSERT INTO symbol (
        id,
        fqn,
        name,
        kind,
        file_id,
        range,
        language
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
        $language
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

export async function replaceFileGraph(
  connection: DuckDBConnection,
  input: ExtractedIndexData,
  extraEdges: readonly EdgeRow[] = [],
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

    if (existingFileId !== null) {
      await deleteExistingRows(connection, existingFileId);
      await updateFile(connection, normalizedInput);
    } else {
      await insertFile(connection, normalizedInput);
    }

    for (const symbol of normalizedInput.symbols) {
      await insertSymbol(connection, symbol);
    }

    await insertImportRefs(connection, normalizedInput);
    await insertDefinesEdges(connection, normalizedInput);
    await insertExtraEdges(connection, normalizedExtraEdges);
  });
}
