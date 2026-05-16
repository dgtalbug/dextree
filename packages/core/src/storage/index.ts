export { openDatabase, readRows, runInTransaction } from "./db.js";
export type { DatabaseHandle } from "./db.js";
export { replaceFileGraph } from "./repository.js";
export { initializeSchema, REQUIRED_TABLES, SCHEMA_STATEMENTS } from "./schema.js";
