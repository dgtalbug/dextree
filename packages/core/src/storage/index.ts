export { openDatabase, readRows, runInTransaction } from "./db.js";
export type { DatabaseHandle } from "./db.js";
export { applyMigrations } from "./migrations/runner.js";
export type {
  MigrationResult,
  MigrationResultFailed,
  MigrationResultOk,
} from "./migrations/runner.js";
export { replaceFileGraph } from "./repository.js";
export { initializeSchema, REQUIRED_TABLES, SCHEMA_STATEMENTS } from "./schema.js";
