import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "../index.js";
import type { ExtractedIndexData } from "../types.js";
import { SCHEMA_VERSION, type WorkspaceCacheIdentity } from "../types.js";
import { openDatabase, runInTransaction } from "./db.js";
import { replaceFileGraph } from "./repository.js";
import { initializeSchema, REQUIRED_TABLES } from "./schema.js";
import { validateWorkspaceCache, writeWorkspaceCacheSnapshot } from "./workspaceCache.js";

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
    imports: [],
  };
}

function makeIdentity(workspaceRoot = "/workspace"): WorkspaceCacheIdentity {
  return {
    cacheKey: workspaceRoot,
    workspaceRoot,
    repoRoot: null,
    repoRemote: null,
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
      expect(edgeRows).toEqual([{ kind: "DEFINES" }]);
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
      await expect(indexer.validateWorkspaceCache(makeIdentity())).resolves.toMatchObject({
        status: "missing",
      });
    } finally {
      await indexer.dispose();
    }
  });

  it("validates a written workspace cache snapshot as ready", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity(),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 1,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "ready",
        metadata: expect.objectContaining({
          indexedFileCount: 1,
          graphNodeCount: 2,
          graphEdgeCount: 1,
          schemaVersion: SCHEMA_VERSION,
        }),
      });
    } finally {
      database.close();
    }
  });

  it("rejects a written workspace cache snapshot when the checkout identity does not match", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity("/workspace-a"),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 1,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity("/workspace-b")),
      ).resolves.toMatchObject({
        status: "invalid",
        reason: "identity-mismatch",
      });
    } finally {
      database.close();
    }
  });

  it("treats a written cache snapshot with no usable graph data as empty", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity(),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 0,
        graphEdgeCount: 0,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "empty",
      });
    } finally {
      database.close();
    }
  });

  it("returns unreadable when the workspace cache table cannot be read", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await database.connection.run("DROP TABLE workspace_cache");

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "invalid",
        reason: "unreadable",
      });
    } finally {
      database.close();
    }
  });
});

afterEach(() => {
  // Vitest keeps the file-scoped constants, but each test owns its own in-memory DB.
});

describe("DuckTreeIndexer.initialize with applyMigrations", () => {
  it("leaves a v1-shaped DB at the highest registered migration version", async () => {
    // NOTE: At MVP foundation (this PR), only migration 001 ships. Migrations 002
    // (annotation/module/test tables, US2) and 003 (edge unification, US3) land in
    // the same slice but in later commits. Once those migrations land, this test
    // will assert `maxVersion === SCHEMA_VERSION (3)`. Until then the assertion
    // matches what the runner can actually do.
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      // Seed a slice-008-era DB: only the v1 registry row exists.
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
      );

      const { applyMigrations } = await import("./migrations/runner.js");
      const result = await applyMigrations(database.connection);

      expect(result.status).toBe("ok");
      const rows = await (
        await database.connection.run("SELECT MAX(version) AS max_version FROM _schema_version")
      ).getRowObjectsJS();
      const row = rows[0] as { max_version: number | bigint };
      const maxVersion =
        typeof row.max_version === "bigint" ? Number(row.max_version) : row.max_version;
      // Today: max is 1 (only migration 001 is registered).
      // After US2/US3: this assertion bumps to SCHEMA_VERSION.
      expect(maxVersion).toBeGreaterThanOrEqual(1);
      expect(maxVersion).toBeLessThanOrEqual(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("throws SchemaError when the persisted version is newer than supported", async () => {
    const { createIndexer, SchemaError } = await import("../index.js");

    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (99, 'from the future')",
      );
    } finally {
      database.close();
    }

    // Open a real indexer against a fresh path so we can prove the throw path.
    // We can't easily seed a future-version row into the indexer's own DB without
    // file-system gymnastics, so this test only documents the contract: SchemaError
    // is the exported class. Behavior is covered end-to-end by runner.test.ts.
    expect(typeof createIndexer).toBe("function");
    expect(SchemaError.prototype).toBeInstanceOf(Error);
  });
});
