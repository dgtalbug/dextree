import type { DuckDBConnection } from "@duckdb/node-api";

import { SCHEMA_VERSION } from "../../types.js";

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
  sql: string;
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

// Migration 003 lands in US3 (T027). The runner already consumes the full list.
const MIGRATIONS: readonly Migration[] = [MIGRATION_001, MIGRATION_002];

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
export async function applyMigrations(connection: DuckDBConnection): Promise<MigrationResult> {
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
      await connection.run("BEGIN TRANSACTION");
      await connection.run(migration.sql);
      await connection.run("COMMIT");
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
