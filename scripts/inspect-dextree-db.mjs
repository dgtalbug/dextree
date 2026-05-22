#!/usr/bin/env node
// Inspect every dextree.db file VS Code is holding, in mtime order.
// Reports table list, _schema_version registry rows, and edge-kind row counts
// so you can confirm a workspace is at the expected schema version (v1 / v2 / v3).
//
// Dev helper — runs the local `duckdb` CLI as a subprocess. Not committed for
// production use. Safe / read-only.
//
// Usage:
//   node scripts/inspect-dextree-db.mjs              # all DBs
//   node scripts/inspect-dextree-db.mjs --latest     # just the most recent
//   node scripts/inspect-dextree-db.mjs <path>       # specific DB file

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STORAGE_ROOT = join(homedir(), "Library/Application Support/Code/User/workspaceStorage");

const args = process.argv.slice(2);
const justLatest = args.includes("--latest");
const explicitPath = args.find((a) => !a.startsWith("--"));

function findDbs() {
  if (explicitPath) {
    return [{ path: explicitPath, workspace: "(explicit)", mtime: 0, size: 0 }];
  }

  let entries;
  try {
    entries = readdirSync(STORAGE_ROOT, { withFileTypes: true });
  } catch (err) {
    console.error(`Cannot read ${STORAGE_ROOT}: ${err.message}`);
    process.exit(1);
  }

  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dbPath = join(STORAGE_ROOT, entry.name, "dgtalbug.dextree", "dextree.db");
    let st;
    try {
      st = statSync(dbPath);
    } catch {
      continue;
    }
    let workspace = "(unknown)";
    try {
      const wsJson = JSON.parse(
        readFileSync(join(STORAGE_ROOT, entry.name, "workspace.json"), "utf8"),
      );
      workspace = (wsJson.folder ?? wsJson.workspace ?? "(none)").replace(/^file:\/\//, "");
    } catch {
      // workspace.json missing or unreadable — leave unknown
    }
    found.push({ path: dbPath, workspace, mtime: st.mtimeMs, size: st.size });
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return justLatest ? found.slice(0, 1) : found;
}

function runDuckDb(dbPath, sql) {
  try {
    const out = execFileSync("duckdb", [dbPath, "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (err) {
    const stderr = err.stderr?.toString() ?? err.message;
    if (/Conflicting lock is held/.test(stderr)) {
      return { ok: false, locked: true, error: stderr };
    }
    return { ok: false, error: stderr };
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtMtime(ms) {
  if (ms === 0) return "(unknown)";
  return new Date(ms).toISOString().replace("T", " ").replace(/\..*/, "");
}

function inspectOne(db) {
  console.log(`\n${"─".repeat(78)}`);
  console.log(`Workspace : ${db.workspace}`);
  console.log(`DB        : ${db.path}`);
  console.log(`mtime     : ${fmtMtime(db.mtime)}`);
  console.log(`size      : ${fmtBytes(db.size)}`);
  console.log(`${"─".repeat(78)}`);

  // Tables
  const tablesQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name`;
  const tables = runDuckDb(db.path, tablesQuery);
  if (!tables.ok) {
    if (tables.locked) {
      console.log("⚠️  Locked by VS Code (close the window that has this workspace open)");
    } else {
      console.log(`✗  Query failed: ${tables.error.split("\n").slice(0, 3).join(" | ")}`);
    }
    return;
  }

  // Parse table names out of the boxy output
  const tableNames = tables.out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^│ \w+ +│$/.test(l))
    .map((l) => l.replace(/[│ ]/g, ""));

  console.log(`Tables (${tableNames.length}):  ${tableNames.join(", ") || "(none)"}`);

  // Schema version
  const hasRegistry = tableNames.includes("_schema_version");
  if (hasRegistry) {
    const registry = runDuckDb(
      db.path,
      "SELECT version, description FROM _schema_version ORDER BY version",
    );
    if (registry.ok) {
      console.log(`\nSchema versions applied:`);
      console.log(registry.out.trim());
    }
  } else {
    console.log(`\nSchema versions:    (no _schema_version table — pre-slice-009 / v1)`);
  }

  // Edge breakdown
  if (tableNames.includes("edge")) {
    const edges = runDuckDb(
      db.path,
      "SELECT kind, COUNT(*) AS rows FROM edge GROUP BY kind ORDER BY kind",
    );
    if (edges.ok) {
      console.log(`\nEdges by kind:`);
      console.log(edges.out.trim());
    }
  }

  // Verdict
  const isV3 = hasRegistry && ["annotation", "module", "test"].every((t) => tableNames.includes(t));
  const isV1 = tableNames.includes("call_site") || tableNames.includes("import_ref");
  if (isV3) {
    console.log(`\n✓ State: v3 (slice 009 contract)`);
  } else if (isV1) {
    console.log(`\n⚠ State: v1 (slice-008 era, sidecars still present — needs migration)`);
  } else {
    console.log(`\n?  State: indeterminate`);
  }
}

const dbs = findDbs();
if (dbs.length === 0) {
  console.error("No dextree.db files found under VS Code's workspaceStorage");
  process.exit(1);
}

console.log(`Inspecting ${dbs.length} dextree.db file(s):`);
for (const db of dbs) {
  inspectOne(db);
}
console.log(`\n${"─".repeat(78)}\nDone.`);
