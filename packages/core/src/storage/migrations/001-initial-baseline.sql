-- Migration 001: initial baseline.
-- Documents that v1 was the starting point so a freshly-created v3 DB has the full
-- version history. The WHERE NOT EXISTS guard makes re-runs safe against an
-- already-seeded v1 DB (prevents PRIMARY KEY conflict on _schema_version).

INSERT INTO _schema_version (version, description)
SELECT 1, 'initial baseline'
WHERE NOT EXISTS (SELECT 1 FROM _schema_version WHERE version = 1);
