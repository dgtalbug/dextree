/**
 * Integration tests for the workspace-cache reopen lifecycle (spec 011 / S5).
 *
 * These tests exercise writeWorkspaceCacheSnapshot → close → new connection →
 * validateWorkspaceCache to prove the persistence layer works end-to-end, not
 * just in a single connection.
 *
 * All tests use an in-memory DB seeded via initializeSchema + applyMigrations so
 * they never touch the filesystem and complete in well under 100 ms.
 */

import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { rmSync } from "fs";
import { describe, it, expect } from "vitest";

import { SCHEMA_VERSION } from "../types.js";
import { openDatabase } from "./db.js";
import { initializeSchema } from "./schema.js";
import { applyMigrations } from "./migrations/runner.js";
import { writeWorkspaceCacheSnapshot } from "./workspaceCache.js";
import { validateWorkspaceCache } from "./workspaceCache.js";

/** Opens a fresh in-memory DB with full schema + all migrations applied. */
async function openFreshDb() {
  const db = await openDatabase(":memory:");
  await initializeSchema(db.connection);
  await applyMigrations(db.connection);
  return db;
}

const TEST_IDENTITY = {
  cacheKey: "/workspace/my-project",
  workspaceRoot: "/workspace/my-project",
  repoRoot: "/workspace/my-project",
  repoRemote: "https://github.com/example/my-project",
};

const TEST_SNAPSHOT = {
  identity: TEST_IDENTITY,
  indexedFileCount: 42,
  graphNodeCount: 100,
  graphEdgeCount: 200,
};

// ---------------------------------------------------------------------------
// T008: Happy-path reopen
// ---------------------------------------------------------------------------
describe("workspaceCache reopen lifecycle — US1", () => {
  it("T008: write snapshot then validate with matching identity returns status=ready", async () => {
    // Use a temp file DB so we can simulate a true "close → reopen" cycle.
    const dbPath = join(tmpdir(), `dextree-test-${randomUUID()}.duckdb`);
    try {
      // --- Write phase ---
      const db1 = await openDatabase(dbPath);
      try {
        await initializeSchema(db1.connection);
        await applyMigrations(db1.connection);
        await writeWorkspaceCacheSnapshot(db1.connection, TEST_SNAPSHOT);
      } finally {
        db1.close();
      }

      // --- Reopen phase ---
      const db2 = await openDatabase(dbPath);
      try {
        const result = await validateWorkspaceCache(db2.connection, TEST_IDENTITY);

        expect(result.status).toBe("ready");
        expect(result.identity).toEqual(TEST_IDENTITY);
        expect(result.metadata).not.toBeNull();
        expect(result.metadata!.indexedFileCount).toBe(42);
        expect(result.metadata!.graphNodeCount).toBe(100);
        expect(result.metadata!.graphEdgeCount).toBe(200);
        expect(result.reason).toBeUndefined();
      } finally {
        db2.close();
      }
    } finally {
      try {
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}.wal`, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ---------------------------------------------------------------------------
  // T009: Identity mismatch on reopen
  // ---------------------------------------------------------------------------
  it("T009: write snapshot then validate with mismatched cacheKey returns status=invalid", async () => {
    const dbPath = join(tmpdir(), `dextree-test-${randomUUID()}.duckdb`);
    try {
      // --- Write phase ---
      const db1 = await openDatabase(dbPath);
      try {
        await initializeSchema(db1.connection);
        await applyMigrations(db1.connection);
        await writeWorkspaceCacheSnapshot(db1.connection, TEST_SNAPSHOT);
      } finally {
        db1.close();
      }

      // --- Reopen with different identity ---
      const differentIdentity = {
        cacheKey: "/workspace/different-project",
        workspaceRoot: "/workspace/different-project",
        repoRoot: null,
        repoRemote: null,
      };

      const db2 = await openDatabase(dbPath);
      try {
        const result = await validateWorkspaceCache(db2.connection, differentIdentity);

        expect(result.status).toBe("invalid");
        expect(result.reason).toBe("identity-mismatch");
      } finally {
        db2.close();
      }
    } finally {
      try {
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}.wal`, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ---------------------------------------------------------------------------
  // T010: Migration upgrade path — DB at v3 without workspace_cache → runMigrations
  // ---------------------------------------------------------------------------
  it("T010: migration upgrade path from v3 to v4 allows write + validate cycle", async () => {
    const dbPath = join(tmpdir(), `dextree-test-${randomUUID()}.duckdb`);
    try {
      // Simulate a v3 DB: schema initialized but only migrations 1-3 applied.
      const db1 = await openDatabase(dbPath);
      try {
        await initializeSchema(db1.connection);
        // Seed v1-v3 version rows to simulate a pre-v4 DB.
        await db1.connection.run(
          "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
        );
        await db1.connection.run(
          "INSERT INTO _schema_version (version, description) VALUES (2, 'add entity tables')",
        );
        await db1.connection.run(
          "INSERT INTO _schema_version (version, description) VALUES (3, 'unify call_site and import_ref into edge')",
        );
        // workspace_cache does NOT exist yet — must be created by migration 004.
        // initializeSchema creates all tables; we drop workspace_cache to simulate v3.
        await db1.connection.run("DROP TABLE IF EXISTS workspace_cache");
      } finally {
        db1.close();
      }

      // --- Upgrade + write phase ---
      const db2 = await openDatabase(dbPath);
      try {
        // applyMigrations should detect missing v4, apply MIGRATION_004, and create the table.
        const migrationResult = await applyMigrations(db2.connection);
        expect(migrationResult.status).toBe("ok");
        expect(migrationResult.applied).toContain("add workspace_cache table");

        await writeWorkspaceCacheSnapshot(db2.connection, TEST_SNAPSHOT);
      } finally {
        db2.close();
      }

      // --- Validate after upgrade ---
      const db3 = await openDatabase(dbPath);
      try {
        const result = await validateWorkspaceCache(db3.connection, TEST_IDENTITY);

        expect(result.status).toBe("ready");
        expect(result.metadata).not.toBeNull();
        expect(result.metadata!.schemaVersion).toBe(SCHEMA_VERSION);
      } finally {
        db3.close();
      }
    } finally {
      try {
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}.wal`, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
});

// ---------------------------------------------------------------------------
// T019 (US3): schema-mismatch validation
// ---------------------------------------------------------------------------
describe("workspaceCache validation — US3", () => {
  it("T019: snapshot written with old schema_version returns status=invalid reason=schema-mismatch", async () => {
    const db = await openFreshDb();
    try {
      // Write snapshot with an older schema version.
      await writeWorkspaceCacheSnapshot(db.connection, {
        ...TEST_SNAPSHOT,
        schemaVersion: SCHEMA_VERSION - 1,
      });

      const result = await validateWorkspaceCache(db.connection, TEST_IDENTITY);

      expect(result.status).toBe("invalid");
      expect(result.reason).toBe("schema-mismatch");
    } finally {
      db.close();
    }
  });
});
