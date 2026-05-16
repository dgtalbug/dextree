import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "../index.js";
import type { ExtractedIndexData } from "../types.js";
import { openDatabase, runInTransaction } from "./db.js";
import { replaceFileGraph } from "./repository.js";
import { initializeSchema, REQUIRED_TABLES } from "./schema.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "../..");
const wasmDir = resolve(packageRoot, "node_modules");

function makeExtractedData(symbolName = "greet"): ExtractedIndexData {
  return {
    file: {
      id: "file-1",
      path: "/workspace/src/greet.ts",
      relativePath: "src/greet.ts",
      language: "typescript",
      loc: 3,
      hash: `hash-${symbolName}`,
    },
    symbols: [
      {
        id: `symbol-${symbolName}`,
        fqn: `src/greet.ts:${symbolName}`,
        name: symbolName,
        kind: "function",
        fileId: "file-1",
        range: {
          startLine: 0,
          startCol: 0,
          endLine: 0,
          endCol: 10,
        },
        language: "typescript",
      },
    ],
  };
}

describe("storage schema and writes", () => {
  it("initializes the full S1 schema", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const rows = await (
        await database.connection.run(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
            ORDER BY table_name ASC
          `,
        )
      ).getRowObjectsJS();

      expect(rows.map((row) => row.table_name)).toEqual([...REQUIRED_TABLES].sort());
    } finally {
      database.close();
    }
  });

  it("replaces prior rows when the same file is indexed again", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));
      await replaceFileGraph(database.connection, makeExtractedData("wave"));

      const fileRows = await (
        await database.connection.run("SELECT path FROM file")
      ).getRowObjectsJS();
      const symbolRows = await (
        await database.connection.run("SELECT name FROM symbol ORDER BY name ASC")
      ).getRowObjectsJS();
      const edgeRows = await (
        await database.connection.run("SELECT kind FROM edge")
      ).getRowObjectsJS();

      expect(fileRows).toHaveLength(1);
      expect(symbolRows).toEqual([{ name: "wave" }]);
      expect(edgeRows).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("rolls back a transaction when an operation fails", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await expect(
        runInTransaction(database.connection, async () => {
          await database.connection.run(
            `
              INSERT INTO file (
                id,
                path,
                relative_path,
                language,
                loc,
                hash,
                last_indexed,
                _schema_version
              ) VALUES (
                'rollback-file',
                '/workspace/src/rollback.ts',
                'src/rollback.ts',
                'typescript',
                1,
                'hash',
                CURRENT_TIMESTAMP,
                1
              )
            `,
          );

          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const rows = await (
        await database.connection.run("SELECT COUNT(*) AS count FROM file")
      ).getRowObjectsJS();

      expect(rows[0]?.count).toBe(0n);
    } finally {
      database.close();
    }
  });

  it("exposes the public indexer contract against an in-memory database", async () => {
    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await expect(indexer.initialize()).resolves.toBeUndefined();
      await expect(indexer.getSymbols("src/missing.ts")).resolves.toEqual([]);
    } finally {
      await indexer.dispose();
    }
  });
});

afterEach(() => {
  // Vitest keeps the file-scoped constants, but each test owns its own in-memory DB.
});
