-- Migration 006 (v5 → v6): per-symbol entry-point and architectural-layer
-- classification. Adds symbol.entry_kind and symbol.arch_layer columns with
-- conservative defaults so symbols persisted before classification rolled
-- out keep rendering neutrally until the next reindex refreshes them.
--
-- This file is the reference shape of the migration. The actual runner uses
-- a TypeScript apply fn (see runner.ts:runMigration006) because DuckDB
-- rejects ALTER TABLE while indexes reference the table AND rejects ADD
-- COLUMN clauses with NOT NULL / DEFAULT. We drop the three symbol indexes,
-- add bare columns, and recreate the indexes. The NOT NULL DEFAULT
-- constraints stay only on the fresh-DB CREATE TABLE in schema.ts.
--
-- Pre-v6 rows carry NULL until the next reindex (forced by the schema-version
-- bump invalidating the workspace cache) rewrites them with explicit values.

DROP INDEX IF EXISTS idx_symbol_fqn;
DROP INDEX IF EXISTS idx_symbol_file_id;
DROP INDEX IF EXISTS idx_symbol_kind;

ALTER TABLE symbol ADD COLUMN entry_kind VARCHAR;
ALTER TABLE symbol ADD COLUMN arch_layer VARCHAR;

CREATE INDEX IF NOT EXISTS idx_symbol_fqn ON symbol(fqn);
CREATE INDEX IF NOT EXISTS idx_symbol_file_id ON symbol(file_id);
CREATE INDEX IF NOT EXISTS idx_symbol_kind ON symbol(kind);

INSERT INTO _schema_version (version, description)
SELECT 6, 'add symbol.entry_kind and symbol.arch_layer classification columns'
WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 6);
