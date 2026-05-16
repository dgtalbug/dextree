import type { DuckDBConnection } from "@duckdb/node-api";

import { SCHEMA_VERSION } from "../types.js";

export const REQUIRED_TABLES = [
  "file",
  "symbol",
  "edge",
  "call_site",
  "import_ref",
  "diagnostic",
] as const;

export const SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS file (
      id VARCHAR PRIMARY KEY,
      path VARCHAR NOT NULL UNIQUE,
      relative_path VARCHAR NOT NULL,
      language VARCHAR NOT NULL,
      loc UINTEGER NOT NULL,
      hash VARCHAR NOT NULL,
      last_indexed TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _schema_version UINTEGER NOT NULL DEFAULT ${SCHEMA_VERSION},
      last_modified TIMESTAMPTZ,
      last_author VARCHAR,
      change_count_30d UINTEGER,
      is_core BOOLEAN NOT NULL DEFAULT FALSE,
      tags VARCHAR[] DEFAULT [],
      labels VARCHAR[] DEFAULT [],
      metadata JSON DEFAULT '{}'
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS symbol (
      id VARCHAR PRIMARY KEY,
      fqn VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      kind VARCHAR NOT NULL,
      file_id VARCHAR NOT NULL,
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ) NOT NULL,
      language VARCHAR NOT NULL,
      fan_in UINTEGER NOT NULL DEFAULT 0,
      is_core BOOLEAN NOT NULL DEFAULT FALSE,
      flags VARCHAR[] DEFAULT [],
      metrics JSON DEFAULT '{}',
      _schema_version UINTEGER NOT NULL DEFAULT ${SCHEMA_VERSION},
      visibility VARCHAR,
      signature VARCHAR,
      return_type VARCHAR,
      parameter_types VARCHAR[],
      docstring VARCHAR,
      diagnostics JSON,
      embedding FLOAT[1536],
      tags VARCHAR[],
      labels VARCHAR[],
      metadata JSON
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS edge (
      id VARCHAR PRIMARY KEY,
      source_id VARCHAR NOT NULL,
      target_id VARCHAR NOT NULL,
      kind VARCHAR NOT NULL,
      weight FLOAT,
      metadata JSON DEFAULT '{}'
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS call_site (
      id VARCHAR PRIMARY KEY,
      caller_symbol_id VARCHAR,
      callee_symbol_id VARCHAR,
      file_id VARCHAR,
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ),
      language VARCHAR,
      metadata JSON DEFAULT '{}'
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS import_ref (
      id VARCHAR PRIMARY KEY,
      file_id VARCHAR,
      import_path VARCHAR,
      imported_symbol VARCHAR,
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ),
      language VARCHAR,
      metadata JSON DEFAULT '{}'
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS diagnostic (
      id VARCHAR PRIMARY KEY,
      file_id VARCHAR,
      symbol_id VARCHAR,
      severity VARCHAR,
      code VARCHAR,
      message VARCHAR,
      source VARCHAR,
      range STRUCT(
        start_line UINTEGER,
        start_col UINTEGER,
        end_line UINTEGER,
        end_col UINTEGER
      ),
      metadata JSON DEFAULT '{}'
    )
  `,
  "CREATE INDEX IF NOT EXISTS idx_file_path ON file(path)",
  "CREATE INDEX IF NOT EXISTS idx_file_relative_path ON file(relative_path)",
  "CREATE INDEX IF NOT EXISTS idx_symbol_fqn ON symbol(fqn)",
  "CREATE INDEX IF NOT EXISTS idx_symbol_file_id ON symbol(file_id)",
  "CREATE INDEX IF NOT EXISTS idx_symbol_kind ON symbol(kind)",
  "CREATE INDEX IF NOT EXISTS idx_edge_source ON edge(source_id)",
  "CREATE INDEX IF NOT EXISTS idx_edge_target ON edge(target_id)",
  "CREATE INDEX IF NOT EXISTS idx_edge_kind ON edge(kind)",
] as const;

export async function initializeSchema(connection: DuckDBConnection): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await connection.run(statement);
  }
}
