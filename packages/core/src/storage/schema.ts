import type { DuckDBConnection } from "@duckdb/node-api";

import { SCHEMA_VERSION } from "../types.js";

export const REQUIRED_TABLES = [
  "file",
  "symbol",
  "edge",
  "diagnostic",
  "workspace_cache",
  "workspace_framework",
  "_schema_version",
  "annotation",
  "module",
  "test",
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
      metadata JSON DEFAULT '{}',
      framework VARCHAR,
      framework_role VARCHAR
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
      metadata JSON,
      entry_kind VARCHAR NOT NULL DEFAULT 'unclassified',
      arch_layer VARCHAR NOT NULL DEFAULT 'unknown',
      enclosing_symbol_id VARCHAR
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS edge (
      id VARCHAR PRIMARY KEY,
      source_id VARCHAR NOT NULL,
      -- target_id is nullable post-v3: pass-1 IMPORTS edges and pass-1 naive CALLS
      -- edges may not have a resolved target yet; pass-2 (S8 LSP) fills them in.
      target_id VARCHAR,
      kind VARCHAR NOT NULL,
      weight FLOAT,
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
  `
    CREATE TABLE IF NOT EXISTS _schema_version (
      version UINTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description VARCHAR NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS workspace_framework (
      id VARCHAR PRIMARY KEY,
      framework_name VARCHAR NOT NULL UNIQUE,
      detection_source VARCHAR NOT NULL CHECK (
        detection_source IN ('manifest', 'structural', 'manifest+structural')
      ),
      confidence FLOAT NOT NULL DEFAULT 1.0,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
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
    )
  `,
  `
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
      _schema_version UINTEGER NOT NULL DEFAULT ${SCHEMA_VERSION}
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS module (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      fqn VARCHAR NOT NULL,
      language VARCHAR NOT NULL,
      package VARCHAR,
      version VARCHAR,
      metadata JSON DEFAULT '{}',
      _schema_version UINTEGER NOT NULL DEFAULT ${SCHEMA_VERSION}
    )
  `,
  `
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
      _schema_version UINTEGER NOT NULL DEFAULT ${SCHEMA_VERSION}
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
  "CREATE INDEX IF NOT EXISTS idx_annotation_parent ON annotation(parent_symbol_id)",
  "CREATE INDEX IF NOT EXISTS idx_module_fqn ON module(fqn)",
  "CREATE INDEX IF NOT EXISTS idx_test_file ON test(file_id)",
  "CREATE INDEX IF NOT EXISTS idx_test_target ON test(target_symbol_id)",
  "CREATE INDEX IF NOT EXISTS idx_workspace_framework_name ON workspace_framework(framework_name)",
  "CREATE INDEX IF NOT EXISTS idx_file_framework ON file(framework)",
] as const;

export async function initializeSchema(connection: DuckDBConnection): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await connection.run(statement);
  }
}
