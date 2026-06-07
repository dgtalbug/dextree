/**
 * Storage database facade. Re-exports the DuckDB adapter (the only module allowed
 * to touch the driver — RULE-ARCH-003). Storage and query modules import the
 * connection type (`GraphDbConnection`) and helpers from here, never from
 * `@duckdb/node-api` directly.
 */
export {
  openDatabase,
  openReadOnlyDatabase,
  runInTransaction,
  readRows,
  type DatabaseHandle,
  type GraphDbConnection,
  type GraphDbResult,
  type GraphDbValue,
} from "./adapters/duckdb.js";
