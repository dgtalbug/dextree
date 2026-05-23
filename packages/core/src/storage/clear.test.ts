import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { clearAll, clearFile, clearWorkspace } from "./clear.js";
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

describe("clearFile (real DuckDB)", () => {
  function makeFileWithTwoSymbols(): import("../types.js").ExtractedIndexData {
    const fileId = "file-two-sym";
    return {
      file: {
        id: fileId,
        path: "/workspace/src/two-sym.ts",
        relativePath: "src/two-sym.ts",
        language: "typescript",
        loc: 10,
        hash: "hash-two-sym",
      },
      symbols: [
        {
          id: "sym-a",
          fqn: "src/two-sym.ts:funcA",
          name: "funcA",
          kind: "function",
          fileId,
          range: { startLine: 1, startCol: 0, endLine: 1, endCol: 10 },
          language: "typescript",
        },
        {
          id: "sym-b",
          fqn: "src/two-sym.ts:funcB",
          name: "funcB",
          kind: "function",
          fileId,
          range: { startLine: 5, startCol: 0, endLine: 5, endCol: 10 },
          language: "typescript",
        },
      ],
      imports: [
        {
          id: "import-two-sym-0",
          fileId,
          importPath: "react",
          importedSymbol: null,
          range: { startLine: 0, startCol: 0, endLine: 0, endCol: 20 },
          language: "typescript",
        },
      ],
    };
  }

  it("removes one file with 2 symbols and 3 outbound edges and returns correct counts", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeFileWithTwoSymbols());

      const summary = await clearFile(database.connection, "/workspace/src/two-sym.ts");

      // 2 DEFINES edges (source=file, target=symA/symB) + 1 IMPORTS edge (source=file)
      expect(summary).toEqual({ deletedFiles: 1, deletedSymbols: 2, deletedEdges: 3 });

      const fileRows = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM file`)
      ).getRowObjectsJS();
      expect(fileRows[0]?.count).toBe(0n);

      const edgeRows = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM edge`)
      ).getRowObjectsJS();
      expect(edgeRows[0]?.count).toBe(0n);
    } finally {
      database.close();
    }
  });

  it("returns zero counts when the path has never been indexed", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const summary = await clearFile(database.connection, "/workspace/src/ghost.ts");

      expect(summary).toEqual({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 });
    } finally {
      database.close();
    }
  });

  it("is idempotent: second call returns zero counts after first removes the file", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("idempotent"));

      await clearFile(database.connection, "/workspace/src/idempotent.ts");
      const second = await clearFile(database.connection, "/workspace/src/idempotent.ts");

      expect(second).toEqual({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 });
    } finally {
      database.close();
    }
  });

  it("removes inbound edges (target=symbol of deleted file) — US2 cascade (T013)", async () => {
    // file A has one symbol; file B has a CALLS edge targeting that symbol.
    // clearFile(A) must also remove the inbound CALLS edge.
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const fileA = makeExtractedData("fileA");
      await replaceFileGraph(database.connection, fileA);

      const fileB = makeExtractedData("fileB");
      const callsEdge: import("../extractors/types.js").EdgeRow = {
        id: "calls-b-to-a",
        sourceId: "symbol-fileB",
        targetId: "symbol-fileA", // inbound: target is a symbol of file A
        kind: "CALLS",
        weight: null,
        metadata: {},
      };
      await replaceFileGraph(database.connection, fileB, [callsEdge]);

      // Verify the CALLS edge was inserted
      const before = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM edge WHERE kind = 'CALLS'`)
      ).getRowObjectsJS();
      expect(before[0]?.count).toBe(1n);

      await clearFile(database.connection, "/workspace/src/fileA.ts");

      // The CALLS edge (inbound to fileA's symbol) must be gone
      const after = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM edge WHERE kind = 'CALLS'`)
      ).getRowObjectsJS();
      expect(after[0]?.count).toBe(0n);

      // fileB and its data remain intact
      const fileBRows = await (
        await database.connection.run(`SELECT COUNT(*) AS count FROM file WHERE path LIKE '%fileB%'`)
      ).getRowObjectsJS();
      expect(fileBRows[0]?.count).toBe(1n);
    } finally {
      database.close();
    }
  });
});
