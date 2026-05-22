-- Migration 002 (v1 → v2): add Annotation, Module, Test core entity tables.
-- Per design §8.2: file/symbol/annotation/module/test is the baseline core entity
-- set every later slice (S8 LSP, S9 diagnostics, S10 git, S11 blast radius, etc.)
-- consumes. The first two tables (file + symbol) already exist; this migration
-- closes the gap.

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
