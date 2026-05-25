import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseHandle } from "../db.js";
import { initializeSchema } from "../schema.js";
import { applyMigrations } from "./runner.js";

describe("applyMigrations", () => {
  let handle: DatabaseHandle | null = null;

  beforeEach(async () => {
    handle = await openDatabase(":memory:");
    await initializeSchema(handle.connection);
  });

  afterEach(() => {
    if (handle !== null) {
      handle.close();
      handle = null;
    }
  });

  function requireHandle(): DatabaseHandle {
    if (handle === null) {
      throw new Error("test fixture failed: no DB handle");
    }
    return handle;
  }

  async function readRegistry(): Promise<Array<{ version: number; description: string }>> {
    const reader = await requireHandle().connection.run(
      "SELECT version, description FROM _schema_version ORDER BY version",
    );
    const rows = await reader.getRowObjectsJS();
    return rows.map((row) => {
      const r = row as { version: number | bigint; description: string };
      return {
        version: typeof r.version === "bigint" ? Number(r.version) : r.version,
        description: r.description,
      };
    });
  }

  it("populates the registry on a fresh DB", async () => {
    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("ok");
    const registry = await readRegistry();
    expect(registry).toContainEqual({ version: 1, description: "initial baseline" });
  });

  it("is a no-op when re-run on an already-current DB", async () => {
    await applyMigrations(requireHandle().connection);
    const before = await readRegistry();

    const second = await applyMigrations(requireHandle().connection);

    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.applied).toEqual([]);
    }
    const after = await readRegistry();
    expect(after).toEqual(before);
  });

  it("returns status: 'failed' when the persisted version is newer than supported", async () => {
    // Seed an impossibly-future version
    await requireHandle().connection.run(
      "INSERT INTO _schema_version (version, description) VALUES (99, 'from the future')",
    );

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/newer than supported/);
    }
  });

  it("treats migration 001 as idempotent on a pre-seeded v1 DB", async () => {
    // Simulate a slice-008-era DB that already has a v1 marker
    await requireHandle().connection.run(
      "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
    );

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("ok");
    const registry = await readRegistry();
    // Migration 001 used a guard, so re-running on a v1 DB does not duplicate the row
    expect(registry.filter((row) => row.version === 1)).toHaveLength(1);
  });

  it("surfaces a structured failure when reading the registry table errors", async () => {
    // Drop the registry table to provoke a read failure
    await requireHandle().connection.run("DROP TABLE _schema_version");

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/failed to read _schema_version/);
    }
  });

  it("migrates a v1 DB with call_site + import_ref rows into edge (migration 003)", async () => {
    const conn = requireHandle().connection;

    // Re-create the legacy sidecar tables that post-v3 schema.ts no longer creates.
    // This simulates a slice-008-era persisted DB.
    await conn.run(`
      CREATE TABLE call_site (
        id VARCHAR PRIMARY KEY,
        caller_symbol_id VARCHAR,
        callee_symbol_id VARCHAR,
        file_id VARCHAR,
        range STRUCT(start_line UINTEGER, start_col UINTEGER, end_line UINTEGER, end_col UINTEGER),
        language VARCHAR,
        metadata JSON DEFAULT '{}'
      )
    `);
    await conn.run(`
      CREATE TABLE import_ref (
        id VARCHAR PRIMARY KEY,
        file_id VARCHAR,
        import_path VARCHAR,
        imported_symbol VARCHAR,
        range STRUCT(start_line UINTEGER, start_col UINTEGER, end_line UINTEGER, end_col UINTEGER),
        language VARCHAR,
        metadata JSON DEFAULT '{}'
      )
    `);

    // Seed two import_ref rows and one call_site row.
    await conn.run(`
      INSERT INTO import_ref (id, file_id, import_path, imported_symbol, language)
      VALUES
        ('imp-1', 'file-a', 'src/b.ts', 'helper', 'typescript'),
        ('imp-2', 'file-a', 'src/c.ts', 'util', 'typescript')
    `);
    await conn.run(`
      INSERT INTO call_site (id, caller_symbol_id, callee_symbol_id, file_id, language)
      VALUES ('call-1', 'sym-a', 'sym-b', 'file-a', 'typescript')
    `);

    // Mark the DB as v1 so the runner picks up migrations 002 and 003.
    await conn.run(
      "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
    );

    const result = await applyMigrations(conn);

    if (result.status === "failed") {
      throw new Error(`Migration unexpectedly failed: ${result.reason}`);
    }
    expect(result.status).toBe("ok");

    // call_site and import_ref tables no longer exist after migration 003.
    const tablesReader = await conn.run(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    );
    const tableNames = (await tablesReader.getRowObjectsJS()).map(
      (r) => (r as { table_name: string }).table_name,
    );
    expect(tableNames).not.toContain("call_site");
    expect(tableNames).not.toContain("import_ref");

    // The 2 import rows are now IMPORTS edges, and the 1 call_site row is a CALLS edge.
    const edgeRows = await (
      await conn.run("SELECT kind, source_id, target_id FROM edge ORDER BY id")
    ).getRowObjectsJS();
    const callsEdges = edgeRows.filter((r) => (r as { kind: string }).kind === "CALLS");
    const importsEdges = edgeRows.filter((r) => (r as { kind: string }).kind === "IMPORTS");
    expect(callsEdges).toHaveLength(1);
    expect(importsEdges).toHaveLength(2);

    // Registry now lists v1 through v5.
    const versions = (
      await (
        await conn.run("SELECT version FROM _schema_version ORDER BY version")
      ).getRowObjectsJS()
    ).map((r) => {
      const v = (r as { version: number | bigint }).version;
      return typeof v === "bigint" ? Number(v) : v;
    });
    expect(versions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("adds symbol.entry_kind and symbol.arch_layer columns on a v5 DB (migration 006)", async () => {
    const conn = requireHandle().connection;

    // Simulate a persisted pre-v6 database: drop the classification columns
    // that schema.ts creates on a fresh DB, then mark the registry at v5.
    // DuckDB rejects ALTER while indexes reference the table, so the test
    // setup repeats the same drop/recreate dance the migration uses.
    await conn.run("DROP INDEX IF EXISTS idx_symbol_fqn");
    await conn.run("DROP INDEX IF EXISTS idx_symbol_file_id");
    await conn.run("DROP INDEX IF EXISTS idx_symbol_kind");
    await conn.run("ALTER TABLE symbol DROP COLUMN entry_kind");
    await conn.run("ALTER TABLE symbol DROP COLUMN arch_layer");
    await conn.run("CREATE INDEX idx_symbol_fqn ON symbol(fqn)");
    await conn.run("CREATE INDEX idx_symbol_file_id ON symbol(file_id)");
    await conn.run("CREATE INDEX idx_symbol_kind ON symbol(kind)");
    await conn.run(
      "INSERT INTO _schema_version (version, description) VALUES (5, 'pre-006 baseline')",
    );

    const result = await applyMigrations(conn);

    if (result.status === "failed") {
      throw new Error(`Migration 006 unexpectedly failed: ${result.reason}`);
    }
    expect(result.status).toBe("ok");

    const columnsReader = await conn.run(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'main' AND table_name = 'symbol'
         AND column_name IN ('entry_kind', 'arch_layer')
       ORDER BY column_name`,
    );
    const columnNames = (await columnsReader.getRowObjectsJS()).map(
      (r) => (r as { column_name: string }).column_name,
    );
    expect(columnNames).toEqual(["arch_layer", "entry_kind"]);

    const indexesReader = await conn.run(
      `SELECT index_name FROM duckdb_indexes()
       WHERE table_name = 'symbol' ORDER BY index_name`,
    );
    const indexNames = (await indexesReader.getRowObjectsJS()).map(
      (r) => (r as { index_name: string }).index_name,
    );
    expect(indexNames).toEqual(["idx_symbol_file_id", "idx_symbol_fqn", "idx_symbol_kind"]);
  });

  it("is idempotent when re-run on a v6 DB (migration 006)", async () => {
    const conn = requireHandle().connection;

    const first = await applyMigrations(conn);
    expect(first.status).toBe("ok");

    const second = await applyMigrations(conn);
    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.applied).toEqual([]);
    }

    const versions = (
      await (
        await conn.run("SELECT version FROM _schema_version WHERE version = 6 ORDER BY version")
      ).getRowObjectsJS()
    ).map((r) => {
      const v = (r as { version: number | bigint }).version;
      return typeof v === "bigint" ? Number(v) : v;
    });
    expect(versions).toEqual([6]);
  });
});
