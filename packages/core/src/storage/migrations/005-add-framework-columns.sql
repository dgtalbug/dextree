-- Migration 005 (v4 → v5): per-workspace framework detection.
-- Adds workspace_framework table + file.framework / file.framework_role columns.
-- See specs/018-framework-detection/plan.md §2.

CREATE TABLE IF NOT EXISTS workspace_framework (
  id VARCHAR PRIMARY KEY,
  framework_name VARCHAR NOT NULL UNIQUE,
  detection_source VARCHAR NOT NULL CHECK (
    detection_source IN ('manifest', 'structural', 'manifest+structural')
  ),
  confidence FLOAT NOT NULL DEFAULT 1.0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_framework_name
  ON workspace_framework(framework_name);

ALTER TABLE file ADD COLUMN IF NOT EXISTS framework VARCHAR;
ALTER TABLE file ADD COLUMN IF NOT EXISTS framework_role VARCHAR;

CREATE INDEX IF NOT EXISTS idx_file_framework ON file(framework);

INSERT INTO _schema_version (version, description)
SELECT 5, 'add workspace_framework table and file.framework columns'
WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 5);
