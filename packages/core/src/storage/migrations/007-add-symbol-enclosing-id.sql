-- Migration 007 (v6 → v7): per-symbol enclosing-class classification. Adds
-- symbol.enclosing_symbol_id (nullable) so member symbols (methods, fields,
-- enum variants) carry an explicit pointer to the class / interface / enum
-- they were extracted inside of. Top-level symbols leave the column NULL.
--
-- This file is the reference shape of the migration. The actual runner uses
-- a TypeScript apply fn (see runner.ts:runMigration007) because DuckDB
-- rejects ALTER TABLE while indexes reference the table AND rejects ADD
-- COLUMN clauses with NOT NULL / DEFAULT. We drop the three symbol indexes,
-- add the bare column, and recreate the indexes. No backfill UPDATE — the
-- schema-version bump invalidates the workspace cache and forces a reindex,
-- which rewrites every symbol row with the enclosing id populated by the
-- new ClassRelationExtractor parent-walk (slice 028 T022).
--
-- Pre-v7 rows carry NULL until that reindex completes. NULL is also the
-- correct steady-state value for any symbol that is not a member of a
-- class-like parent (top-level functions, top-level types, etc.).

DROP INDEX IF EXISTS idx_symbol_fqn;
DROP INDEX IF EXISTS idx_symbol_file_id;
DROP INDEX IF EXISTS idx_symbol_kind;

ALTER TABLE symbol ADD COLUMN enclosing_symbol_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_symbol_fqn ON symbol(fqn);
CREATE INDEX IF NOT EXISTS idx_symbol_file_id ON symbol(file_id);
CREATE INDEX IF NOT EXISTS idx_symbol_kind ON symbol(kind);

INSERT INTO _schema_version (version, description)
SELECT 7, 'add symbol.enclosing_symbol_id classification column'
WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 7);
