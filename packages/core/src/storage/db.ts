import type { DuckDBConnection, DuckDBInstance, DuckDBMaterializedResult } from "@duckdb/node-api";

import type { Logger } from "../types.js";

export interface DatabaseHandle {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
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
  connection: DuckDBConnection,
  operation: () => Promise<T>,
  logger?: Logger,
): Promise<T> {
  // Nesting guard — throws synchronously before any SQL is issued.
  if (inTransaction) {
    throw new Error("Nested runInTransaction detected");
  }
  inTransaction = true;

  // Pre-flight: clear any lingering aborted transaction from a previous call.
  // "No active transaction" is expected on a clean connection and not an error.
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Normal path — no active transaction to roll back.
  }

  logger?.debug("BEGIN TRANSACTION");
  await connection.run("BEGIN TRANSACTION");

  try {
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
  result: Promise<DuckDBMaterializedResult> | DuckDBMaterializedResult,
): Promise<Record<string, unknown>[]> {
  return (await result).getRowObjectsJS();
}
