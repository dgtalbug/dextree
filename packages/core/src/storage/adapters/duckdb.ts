import type {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBMaterializedResult,
  DuckDBValue,
} from "@duckdb/node-api";

import type { Logger } from "../../types.js";

/**
 * DuckDB adapter — the ONLY module in core permitted to import the `@duckdb/node-api`
 * driver (RULE-ARCH-003, enforced by ESLint). Storage and query modules depend on
 * the connection type re-exported here, not on the driver directly, so the concrete
 * database is swappable from one place.
 */

/** The database connection surface the storage + query layers depend on. */
export type GraphDbConnection = DuckDBConnection;
/** A materialized query result (row readers). */
export type GraphDbResult = DuckDBMaterializedResult;
/** A bound statement parameter value. */
export type GraphDbValue = DuckDBValue;

export interface DatabaseHandle {
  instance: DuckDBInstance;
  connection: GraphDbConnection;
  close(): void;
}

let inTransaction = false;

export async function openDatabase(dbPath: string): Promise<DatabaseHandle> {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();

  return {
    instance,
    connection,
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

/**
 * Open a foreign DuckDB file read-only (e.g. another workspace's index for the
 * switcher). Read-only so we never mutate a DB owned by a different session.
 */
export async function openReadOnlyDatabase(dbPath: string): Promise<DatabaseHandle> {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(dbPath, { access_mode: "READ_ONLY" });
  const connection = await instance.connect();

  return {
    instance,
    connection,
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

/**
 * Runs `operation` inside a BEGIN TRANSACTION / COMMIT block.
 *
 * Resilience contract:
 * - A defensive ROLLBACK is issued before BEGIN TRANSACTION to clear any
 *   aborted state left by a previous failed transaction (e.g. if the prior
 *   ROLLBACK threw due to a DuckDB Node API quirk). Errors from this
 *   pre-flight ROLLBACK are silently ignored — the only two outcomes are
 *   "no active transaction" (normal) or "aborted state cleared" (desired).
 * - On operation failure, ROLLBACK is attempted and any error it throws is
 *   swallowed so the original error always propagates to the caller.
 * - A runtime guard throws `Error("Nested runInTransaction detected")` if
 *   called while another `runInTransaction` is already in-flight. This
 *   prevents silent rollback of the outer transaction.
 *
 * NOTE: `runInTransaction` must never be called from inside another
 * `runInTransaction` block. The defensive ROLLBACK would silently undo the
 * outer transaction. All call sites in this codebase use it at the top level.
 */
export async function runInTransaction<T>(
  connection: GraphDbConnection,
  operation: () => Promise<T>,
  logger?: Logger,
): Promise<T> {
  // Nesting guard — throws synchronously before any SQL is issued.
  if (inTransaction) {
    throw new Error("Nested runInTransaction detected");
  }

  // Pre-flight: clear any lingering aborted transaction from a previous call.
  // "No active transaction" is expected on a clean connection and not an error.
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Normal path — no active transaction to roll back.
  }

  try {
    inTransaction = true;
    logger?.debug("BEGIN TRANSACTION");
    await connection.run("BEGIN TRANSACTION");

    const result = await operation();
    logger?.debug("COMMIT");
    await connection.run("COMMIT");
    return result;
  } catch (error) {
    logger?.error("ROLLBACK", error, {});
    // Wrap ROLLBACK so a failing rollback doesn't replace the original error.
    try {
      await connection.run("ROLLBACK");
    } catch {
      // Best-effort only — the pre-flight on the next call will clean this up.
    }
    throw error;
  } finally {
    inTransaction = false;
  }
}

export async function readRows(
  result: Promise<GraphDbResult> | GraphDbResult,
): Promise<Record<string, unknown>[]> {
  return (await result).getRowObjectsJS();
}
