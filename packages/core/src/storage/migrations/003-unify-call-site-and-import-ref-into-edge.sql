-- Migration 003 (v2 → v3): unify call_site + import_ref into edge.
-- Audit finding F4: pass-1 needs single source of truth for CALLS and IMPORTS edges.
-- Pre-v3, "call_site" and "import_ref" were typed sidecars whose unique columns
-- become edge.metadata JSON keys. Drop the sidecar tables after copy.

-- 1. Copy any existing call_site rows into edge.
--    caller_symbol_id → source_id, callee_symbol_id → target_id, kind = 'CALLS'.
--    Skip rows where caller_symbol_id is NULL (those were placeholders only).
INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
SELECT
  cs.id,
  cs.caller_symbol_id,
  cs.callee_symbol_id,
  'CALLS',
  NULL,
  json_object(
    'call_site_range', cs.range,
    'language', cs.language,
    'kind', 'naive'
  )
FROM call_site cs
WHERE cs.caller_symbol_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM edge e WHERE e.id = cs.id
  );

-- 2. Copy import_ref rows into edge as IMPORTS edges.
--    source = file_id; target = resolved file_id when joinable, NULL otherwise.
--    Unresolved imports keep their import_path in metadata for later resolution.
INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
SELECT
  ir.id,
  ir.file_id,
  dst.id,
  'IMPORTS',
  NULL,
  json_object(
    'import_path', ir.import_path,
    'imported_symbol', ir.imported_symbol,
    'import_range', ir.range,
    'language', ir.language
  )
FROM import_ref ir
LEFT JOIN file dst ON dst.relative_path = ir.import_path
WHERE NOT EXISTS (
    SELECT 1 FROM edge e WHERE e.id = ir.id
  );

-- 3. Drop the sidecar tables. The application code no longer reads or writes them
--    starting in this version.
DROP TABLE IF EXISTS call_site;
DROP TABLE IF EXISTS import_ref;

-- 4. Register v3.
INSERT INTO _schema_version (version, description)
SELECT 3, 'unify call_site and import_ref into edge'
WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 3);
