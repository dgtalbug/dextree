import type { DuckDBConnection } from "@duckdb/node-api";

import { SCHEMA_VERSION } from "../../types.js";
import type { Logger } from "../../types.js";

/**
 * Migrations are inlined as string constants rather than loaded from disk because
 * `tsup` bundles `packages/core` to a single file and `__dirname`/`import.meta.url`
 * resolution against `.sql` siblings is brittle once the bundle ships inside the
 * extension's `.vsix`. The cost of inlining is small (3 migrations, ~60 lines of
 * SQL total) and the benefit is that the runner works identically in tests and in
 * production.
 *
 * Each migration is idempotent — re-running it against an already-current DB is
 * a no-op. The registry table tracks which version a DB has reached, and the
 * runner only executes migrations whose `version > currentVersion`.
 */

interface Migration {
  version: number;
  description: string;
  /**
   * SQL body executed in a single `connection.run(sql)` call. Empty when the
   * migration needs branching logic (e.g. conditional table existence checks);
   * in that case `apply` is provided instead.
   */
  sql: string;
  /**
   * Optional TypeScript-driven migration. Used when the migration needs to
   * dispatch multiple statements conditionally (e.g. migration 003, which
   * has to skip sidecar copy on fresh DBs that never had call_site/import_ref).
   * If present, the runner calls `apply` instead of `connection.run(sql)`.
   */
  apply?: (connection: DuckDBConnection) => Promise<void>;
}

const MIGRATION_001: Migration = {
  version: 1,
  description: "initial baseline",
  sql: `
    INSERT INTO _schema_version (version, description)
    SELECT 1, 'initial baseline'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 1);
  `,
};

const MIGRATION_002: Migration = {
  version: 2,
  description: "add annotation/module/test entity tables",
  sql: `
    CREATE TABLE IF NOT EXISTS annotation (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      args JSON DEFAULT '{}',
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ),
      parent_symbol_id VARCHAR NOT NULL,
      language VARCHAR NOT NULL,
      metadata JSON DEFAULT '{}',
      _schema_version UINTEGER NOT NULL DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS module (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      fqn VARCHAR NOT NULL,
      language VARCHAR NOT NULL,
      package VARCHAR,
      version VARCHAR,
      metadata JSON DEFAULT '{}',
      _schema_version UINTEGER NOT NULL DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS test (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      framework VARCHAR NOT NULL,
      file_id VARCHAR NOT NULL,
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ) NOT NULL,
      target_symbol_id VARCHAR,
      target_confidence FLOAT DEFAULT 0.0,
      metadata JSON DEFAULT '{}',
      _schema_version UINTEGER NOT NULL DEFAULT 3
    );

    CREATE INDEX IF NOT EXISTS idx_annotation_parent ON annotation(parent_symbol_id);
    CREATE INDEX IF NOT EXISTS idx_module_fqn ON module(fqn);
    CREATE INDEX IF NOT EXISTS idx_test_file ON test(file_id);
    CREATE INDEX IF NOT EXISTS idx_test_target ON test(target_symbol_id);

    INSERT INTO _schema_version (version, description)
    SELECT 2, 'add annotation/module/test entity tables'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 2);
  `,
};

// Migration 003 runs in two steps because the data-copy phase depends on the
// sidecar tables existing. Fresh DBs (created post-v3 via schema.ts) never have
// these tables, so the runner skips the copy step when they're absent — but
// still registers v3 and ensures the sidecars are dropped if a stale install
// somehow created them.
async function runMigration003(connection: DuckDBConnection): Promise<void> {
  // Relax edge.target_id from NOT NULL to nullable. Pass-1 IMPORTS edges and
  // naive CALLS edges may not have a resolved target yet. Check the column's
  // current nullability via information_schema BEFORE running ALTER — running it
  // unconditionally would either throw on fresh DBs (column already nullable)
  // or poison the migration's transaction.
  //
  // DuckDB refuses to ALTER a column while indexes reference that table, so we
  // drop the three edge indexes first and recreate them after the ALTER.
  const targetIdIsNotNull = await columnIsNotNull(connection, "edge", "target_id");
  if (targetIdIsNotNull) {
    await connection.run("DROP INDEX IF EXISTS idx_edge_source");
    await connection.run("DROP INDEX IF EXISTS idx_edge_target");
    await connection.run("DROP INDEX IF EXISTS idx_edge_kind");
    await connection.run("ALTER TABLE edge ALTER COLUMN target_id DROP NOT NULL");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_edge_source ON edge(source_id)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_edge_target ON edge(target_id)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_edge_kind ON edge(kind)");
  }

  const callSiteExists = await tableExists(connection, "call_site");
  const importRefExists = await tableExists(connection, "import_ref");

  if (callSiteExists) {
    await connection.run(`
      INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
      SELECT
        cs.id,
        cs.caller_symbol_id,
        cs.callee_symbol_id,
        'CALLS',
        NULL,
        json_object(
          'call_site_range', cs.range,
          'language', cs.language,
          'kind', 'naive'
        )
      FROM call_site cs
      WHERE cs.caller_symbol_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM edge e WHERE e.id = cs.id
        )
    `);
    await connection.run("DROP TABLE call_site");
  }

  if (importRefExists) {
    await connection.run(`
      INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
      SELECT
        ir.id,
        ir.file_id,
        dst.id,
        'IMPORTS',
        NULL,
        json_object(
          'import_path', ir.import_path,
          'imported_symbol', ir.imported_symbol,
          'import_range', ir.range,
          'language', ir.language
        )
      FROM import_ref ir
      LEFT JOIN file dst ON dst.relative_path = ir.import_path
      WHERE NOT EXISTS (
          SELECT 1 FROM edge e WHERE e.id = ir.id
        )
    `);
    await connection.run("DROP TABLE import_ref");
  }

  await connection.run(`
    INSERT INTO _schema_version (version, description)
    SELECT 3, 'unify call_site and import_ref into edge'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 3)
  `);
}

async function tableExists(connection: DuckDBConnection, tableName: string): Promise<boolean> {
  const reader = await connection.run(
    `SELECT 1 AS present FROM information_schema.tables
     WHERE table_schema = 'main' AND table_name = '${tableName}'`,
  );
  const rows = await reader.getRowObjectsJS();
  return rows.length > 0;
}

async function columnExists(
  connection: DuckDBConnection,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const reader = await connection.run(
    `SELECT 1 AS present FROM information_schema.columns
     WHERE table_schema = 'main' AND table_name = '${tableName}' AND column_name = '${columnName}'`,
  );
  const rows = await reader.getRowObjectsJS();
  return rows.length > 0;
}

async function columnIsNotNull(
  connection: DuckDBConnection,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const reader = await connection.run(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'main' AND table_name = '${tableName}' AND column_name = '${columnName}'`,
  );
  const rows = await reader.getRowObjectsJS();
  if (rows.length === 0) {
    return false;
  }
  const row = rows[0] as { is_nullable: string };
  // information_schema returns 'YES' or 'NO'
  return row.is_nullable === "NO";
}

const MIGRATION_003: Migration = {
  version: 3,
  description: "unify call_site and import_ref into edge",
  // SQL body is empty because the runner dispatches to `runMigration003` instead.
  // We keep the Migration entry so version-bookkeeping stays uniform.
  sql: "",
  apply: runMigration003,
};

const MIGRATION_004: Migration = {
  version: 4,
  description: "add workspace_cache table",
  sql: `
    CREATE TABLE IF NOT EXISTS workspace_cache (
      id UINTEGER PRIMARY KEY,
      cache_key VARCHAR NOT NULL,
      workspace_root VARCHAR NOT NULL,
      repo_root VARCHAR,
      repo_remote VARCHAR,
      schema_version UINTEGER NOT NULL,
      last_successful_index_at TIMESTAMPTZ,
      indexed_file_count UINTEGER NOT NULL DEFAULT 0,
      graph_node_count UINTEGER NOT NULL DEFAULT 0,
      graph_edge_count UINTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (id = 1)
    );
    INSERT INTO _schema_version (version, description)
    SELECT 4, 'add workspace_cache table'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 4);
  `,
};

const MIGRATION_005: Migration = {
  version: 5,
  description: "add workspace_framework table and file.framework columns",
  sql: `
    CREATE TABLE IF NOT EXISTS workspace_framework (
      id VARCHAR PRIMARY KEY,
      framework_name VARCHAR NOT NULL UNIQUE,
      detection_source VARCHAR NOT NULL CHECK (
        detection_source IN ('manifest', 'structural', 'manifest+structural')
      ),
      confidence FLOAT NOT NULL DEFAULT 1.0,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_framework_name
      ON workspace_framework(framework_name);
    ALTER TABLE file ADD COLUMN IF NOT EXISTS framework VARCHAR;
    ALTER TABLE file ADD COLUMN IF NOT EXISTS framework_role VARCHAR;
    CREATE INDEX IF NOT EXISTS idx_file_framework ON file(framework);
    INSERT INTO _schema_version (version, description)
    SELECT 5, 'add workspace_framework table and file.framework columns'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 5);
  `,
};

// DuckDB rejects ALTER TABLE while indexes reference the table and also
// rejects ADD COLUMN clauses with NOT NULL / DEFAULT ("Adding columns with
// constraints not yet supported"). Combining ALTER + UPDATE on the same
// table inside one transaction is also rejected. We drop the three symbol
// indexes, add bare columns, and recreate the indexes — no UPDATE here.
//
// Pre-v6 rows carry NULL entry_kind / arch_layer briefly. The schema-version
// bump invalidates the workspace cache (validateWorkspaceCache compares
// metadata.schemaVersion to SCHEMA_VERSION), which forces a reindex on the
// next session. That reindex rewrites every symbol row with explicit
// classification values from classifySymbol(), so the NULLs are short-lived.
// The subgraph projection coalesces NULL to the conservative fallback so
// any read between migration and reindex still renders sensibly.
async function runMigration006(connection: DuckDBConnection): Promise<void> {
  const hasEntryKind = await columnExists(connection, "symbol", "entry_kind");
  const hasArchLayer = await columnExists(connection, "symbol", "arch_layer");

  if (!hasEntryKind || !hasArchLayer) {
    await connection.run("DROP INDEX IF EXISTS idx_symbol_fqn");
    await connection.run("DROP INDEX IF EXISTS idx_symbol_file_id");
    await connection.run("DROP INDEX IF EXISTS idx_symbol_kind");

    if (!hasEntryKind) {
      await connection.run("ALTER TABLE symbol ADD COLUMN entry_kind VARCHAR");
    }
    if (!hasArchLayer) {
      await connection.run("ALTER TABLE symbol ADD COLUMN arch_layer VARCHAR");
    }

    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_fqn ON symbol(fqn)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_file_id ON symbol(file_id)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_kind ON symbol(kind)");
  }

  await connection.run(`
    INSERT INTO _schema_version (version, description)
    SELECT 6, 'add symbol.entry_kind and symbol.arch_layer classification columns'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 6)
  `);
}

const MIGRATION_006: Migration = {
  version: 6,
  description: "add symbol.entry_kind and symbol.arch_layer classification columns",
  sql: "",
  apply: runMigration006,
};

// Same DuckDB constraint chain as migration 006: drop indexes → bare ADD COLUMN
// → recreate indexes. No backfill UPDATE — pre-v7 symbol rows carry NULL
// enclosing_symbol_id briefly. The schema-version bump invalidates the workspace
// cache (validateWorkspaceCache compares metadata.schemaVersion to
// SCHEMA_VERSION), which forces a reindex on the next session. That reindex
// rewrites every symbol row with the parent class id populated by
// ClassRelationExtractor's tree-sitter parent walk (slice 028 T022). NULL is
// also the correct steady-state value for any top-level symbol that is not a
// member of a class-like parent.
async function runMigration007(connection: DuckDBConnection): Promise<void> {
  const hasEnclosingId = await columnExists(connection, "symbol", "enclosing_symbol_id");

  if (!hasEnclosingId) {
    await connection.run("DROP INDEX IF EXISTS idx_symbol_fqn");
    await connection.run("DROP INDEX IF EXISTS idx_symbol_file_id");
    await connection.run("DROP INDEX IF EXISTS idx_symbol_kind");

    await connection.run("ALTER TABLE symbol ADD COLUMN enclosing_symbol_id VARCHAR");

    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_fqn ON symbol(fqn)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_file_id ON symbol(file_id)");
    await connection.run("CREATE INDEX IF NOT EXISTS idx_symbol_kind ON symbol(kind)");
  }

  await connection.run(`
    INSERT INTO _schema_version (version, description)
    SELECT 7, 'add symbol.enclosing_symbol_id classification column'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 7)
  `);
}

const MIGRATION_007: Migration = {
  version: 7,
  description: "add symbol.enclosing_symbol_id classification column",
  sql: "",
  apply: runMigration007,
};

const MIGRATION_008: Migration = {
  version: 8,
  description: "add folder table for root→folder→file→symbol tree (CONTAINS edges)",
  sql: `
    CREATE TABLE IF NOT EXISTS folder (
      id VARCHAR PRIMARY KEY,
      path VARCHAR NOT NULL,
      parent_id VARCHAR,
      _schema_version UINTEGER NOT NULL DEFAULT 8
    );
    CREATE INDEX IF NOT EXISTS idx_folder_path ON folder(path);
    CREATE INDEX IF NOT EXISTS idx_folder_parent ON folder(parent_id);

    INSERT INTO _schema_version (version, description)
    SELECT 8, 'add folder table for root→folder→file→symbol tree (CONTAINS edges)'
    WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 8);
  `,
};

const MIGRATIONS: readonly Migration[] = [
  MIGRATION_001,
  MIGRATION_002,
  MIGRATION_003,
  MIGRATION_004,
  MIGRATION_005,
  MIGRATION_006,
  MIGRATION_007,
  MIGRATION_008,
];

export interface MigrationResultOk {
  status: "ok";
  from: number;
  to: number;
  applied: string[];
}

export interface MigrationResultFailed {
  status: "failed";
  from: number;
  to: number;
  applied: string[];
  reason: string;
}

export type MigrationResult = MigrationResultOk | MigrationResultFailed;

async function readCurrentVersion(connection: DuckDBConnection): Promise<number> {
  const reader = await connection.run(
    "SELECT COALESCE(MAX(version), 0) AS version FROM _schema_version",
  );
  const rows = await reader.getRowObjectsJS();
  const first = rows[0] as { version?: number | bigint } | undefined;
  if (first === undefined || first.version === undefined) {
    return 0;
  }
  return typeof first.version === "bigint" ? Number(first.version) : first.version;
}

/**
 * Idempotent schema-migration runner.
 *
 * Behavior:
 * 1. Read the highest applied version from `_schema_version` (created on first call
 *    via `initializeSchema`; runner does NOT create the table itself).
 * 2. If `currentVersion > SCHEMA_VERSION`, return failure — DB was written by a
 *    newer build than we know about.
 * 3. For each migration whose `version > currentVersion && <= SCHEMA_VERSION`, run
 *    its SQL inside a `BEGIN TRANSACTION` / `COMMIT` pair. On error: `ROLLBACK`
 *    and return `status: "failed"`.
 * 4. Return `{ status: "ok", from, to, applied }` listing the migration descriptions.
 *
 * The runner does NOT throw on migration failure — callers (currently
 * `DuckTreeIndexer.initialize`) decide whether failure is fatal.
 */
export async function applyMigrations(
  connection: DuckDBConnection,
  logger?: Logger,
): Promise<MigrationResult> {
  const applied: string[] = [];
  let currentVersion: number;
  try {
    currentVersion = await readCurrentVersion(connection);
  } catch (error) {
    return {
      status: "failed",
      from: 0,
      to: 0,
      applied,
      reason: `failed to read _schema_version: ${describeError(error)}`,
    };
  }

  if (currentVersion > SCHEMA_VERSION) {
    return {
      status: "failed",
      from: currentVersion,
      to: currentVersion,
      applied,
      reason: `persisted schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}`,
    };
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }
    if (migration.version > SCHEMA_VERSION) {
      break;
    }
    try {
      logger?.info(`Running migration ${migration.version}: ${migration.description}`);
      await connection.run("BEGIN TRANSACTION");
      if (migration.apply !== undefined) {
        await migration.apply(connection);
      } else {
        await connection.run(migration.sql);
      }
      await connection.run("COMMIT");
      logger?.info(`Migration ${migration.version} OK`);
      applied.push(migration.description);
      currentVersion = migration.version;
    } catch (error) {
      try {
        await connection.run("ROLLBACK");
      } catch {
        // Rollback itself failing means the connection is unrecoverable; the
        // outer error is the one worth surfacing.
      }
      return {
        status: "failed",
        from: currentVersion,
        to: currentVersion,
        applied,
        reason: `migration ${migration.version} (${migration.description}) failed: ${describeError(error)}`,
      };
    }
  }

  const firstMigration = MIGRATIONS[0];
  const startingVersion =
    applied.length === 0 || firstMigration === undefined
      ? currentVersion
      : firstMigration.version - 1;

  return {
    status: "ok",
    from: startingVersion,
    to: currentVersion,
    applied,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
