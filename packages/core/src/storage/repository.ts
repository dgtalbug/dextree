import type { DuckDBConnection } from "@duckdb/node-api";
import { v4 as uuidv4 } from "uuid";

import type { ExtractedIndexData, StoredSymbol } from "../types.js";
import { runInTransaction } from "./db.js";

function rangeParams(symbol: StoredSymbol): Record<string, number> {
  return {
    start_line: symbol.range.startLine,
    start_col: symbol.range.startCol,
    end_line: symbol.range.endLine,
    end_col: symbol.range.endCol,
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
  await connection.run(
    `
      DELETE FROM edge
      WHERE source_id = $file_id
         OR target_id IN (SELECT id FROM symbol WHERE file_id = $file_id)
    `,
    { file_id: existingFileId },
  );
  await connection.run("DELETE FROM symbol WHERE file_id = $file_id", {
    file_id: existingFileId,
  });
}

async function insertFile(connection: DuckDBConnection, input: ExtractedIndexData): Promise<void> {
  await connection.run(
    `
      INSERT INTO file (
        id,
        path,
        relative_path,
        language,
        loc,
        hash,
        last_indexed,
        _schema_version,
        last_modified,
        last_author,
        change_count_30d,
        is_core,
        tags,
        labels,
        metadata
      ) VALUES (
        $id,
        $path,
        $relative_path,
        $language,
        $loc,
        $hash,
        CURRENT_TIMESTAMP,
        1,
        NULL,
        NULL,
        NULL,
        FALSE,
        []::VARCHAR[],
        []::VARCHAR[],
        '{}'::JSON
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
  await connection.run(
    `
      UPDATE file
      SET
        relative_path = $relative_path,
        language = $language,
        loc = $loc,
        hash = $hash,
        last_indexed = CURRENT_TIMESTAMP,
        _schema_version = 1,
        last_modified = NULL,
        last_author = NULL,
        change_count_30d = NULL,
        is_core = FALSE,
        tags = []::VARCHAR[],
        labels = []::VARCHAR[],
        metadata = '{}'::JSON
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
        fan_in,
        is_core,
        flags,
        metrics,
        _schema_version,
        visibility,
        signature,
        return_type,
        parameter_types,
        docstring,
        diagnostics,
        embedding,
        tags,
        labels,
        metadata
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
        0,
        FALSE,
        []::VARCHAR[],
        '{}'::JSON,
        1,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
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
        VALUES ($id, $source_id, $target_id, 'structural', NULL, '{}'::JSON)
      `,
      {
        id: uuidv4(),
        source_id: input.file.id,
        target_id: symbol.id,
      },
    );
  }
}

export async function replaceFileGraph(
  connection: DuckDBConnection,
  input: ExtractedIndexData,
): Promise<void> {
  await runInTransaction(connection, async () => {
    const existingFileId = await findExistingFileId(connection, input.file.path);
    const normalizedInput: ExtractedIndexData = {
      file: {
        ...input.file,
        id: existingFileId ?? input.file.id,
      },
      symbols: input.symbols.map((symbol) => ({
        ...symbol,
        fileId: existingFileId ?? input.file.id,
      })),
    };

    if (existingFileId !== null) {
      await deleteExistingRows(connection, existingFileId);
      await updateFile(connection, normalizedInput);
    } else {
      await insertFile(connection, normalizedInput);
    }

    for (const symbol of normalizedInput.symbols) {
      await insertSymbol(connection, symbol);
    }

    await insertDefinesEdges(connection, normalizedInput);
  });
}
