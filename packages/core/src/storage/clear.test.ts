import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { clearAll, clearWorkspace } from "./clear.js";
import { openDatabase } from "./db.js";
import { replaceFileGraph } from "./repository.js";
import { initializeSchema, REQUIRED_TABLES } from "./schema.js";

function makeExtractedData(
  name: string,
  options?: { workspaceRoot?: string; imports?: string[] },
): ExtractedIndexData {
  const workspaceRoot = options?.workspaceRoot ?? "/workspace";
  const fileId = `file-${name}`;

  return {
    file: {
      id: fileId,
      path: `${workspaceRoot}/src/${name}.ts`,
      relativePath: `src/${name}.ts`,
      language: "typescript",
      loc: 3,
      hash: `hash-${name}`,
    },
    symbols: [
      {
        id: `symbol-${name}`,
        fqn: `src/${name}.ts:${name}`,
        name,
        kind: "function",
        fileId,
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 10 },
        language: "typescript",
      },
    ],
    imports: (options?.imports ?? []).map((importPath, index) => ({
      id: `import-${name}-${index}`,
      fileId,
      importPath,
      importedSymbol: null,
      range: { startLine: index, startCol: 0, endLine: index, endCol: 20 },
      language: "typescript",
    })),
  };
}

describe("clearWorkspace (real DuckDB)", () => {
  it("removes only rows for the given workspace and leaves other workspaces intact", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("alpha"));
      await replaceFileGraph(database.connection, makeExtractedData("beta"));
      await replaceFileGraph(
        database.connection,
        makeExtractedData("outside", { workspaceRoot: "/other-workspace" }),
      );

      const summary = await clearWorkspace(database.connection, "/workspace");

      expect(summary).toEqual({
        deletedFiles: 2,
        deletedSymbols: 2,
        deletedEdges: 2,
      });

      const remaining = await (
        await database.connection.run(`SELECT path FROM file ORDER BY path ASC`)
      ).getRowObjectsJS();
      expect(remaining).toEqual([{ path: "/other-workspace/src/outside.ts" }]);
    } finally {
      database.close();
    }
  });

  it("is a no-op (no throw, zero deletes) when the workspace has never been indexed", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const summary = await clearWorkspace(database.connection, "/empty-workspace");

      expect(summary).toEqual({
        deletedFiles: 0,
        deletedSymbols: 0,
        deletedEdges: 0,
      });
    } finally {
      database.close();
    }
  });

  it("is idempotent: running twice in a row succeeds with zero deletes the second time", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("alpha"));

      await clearWorkspace(database.connection, "/workspace");
      const second = await clearWorkspace(database.connection, "/workspace");

      expect(second).toEqual({
        deletedFiles: 0,
        deletedSymbols: 0,
        deletedEdges: 0,
      });
    } finally {
      database.close();
    }
  });
});

describe("clearAll (real DuckDB)", () => {
  it("drops and recreates all required tables", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("alpha"));

      const summary = await clearAll(database.connection);

      expect(summary.clearedTables).toBe(REQUIRED_TABLES.length);

      const tables = await (
        await database.connection.run(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'main' ORDER BY table_name ASC`,
        )
      ).getRowObjectsJS();
      expect(tables.map((row) => row.table_name)).toEqual([...REQUIRED_TABLES].sort());

      const rows = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM file`)
      ).getRowObjectsJS();
      expect(rows[0]?.count).toBe(0n);
    } finally {
      database.close();
    }
  });
});
