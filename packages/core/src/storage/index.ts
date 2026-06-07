// Storage layer barrel. Connection-first functions are intentionally NOT
// re-exported: the only supported entry point to storage is the GraphRepository
// interface and its DuckDB adapter (RULE-ARCH-003), so a connection never
// appears in the surface other modules import.
export type { DatabaseHandle } from "./db.js";
export type {
  MigrationResult,
  MigrationResultFailed,
  MigrationResultOk,
} from "./migrations/runner.js";
export type { ForeignGraphReader, GraphRepository } from "./graphRepository.js";
export {
  DuckDbForeignGraphReader,
  DuckDbGraphRepository,
} from "./adapters/duckdbGraphRepository.js";
export { REQUIRED_TABLES, SCHEMA_STATEMENTS } from "./schema.js";
