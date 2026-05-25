/**
 * Tests for `readWorkspaceIndexSummary` (slice 024 — workspace switcher).
 *
 * Uses real temp DuckDB files so we exercise the read-only open path that the
 * extension host will use against foreign workspace DBs.
 */

import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "./migrations/runner.js";
import { openDatabase } from "./db.js";
import { replaceWorkspaceFrameworks } from "./repository.js";
import { initializeSchema } from "./schema.js";
import { writeWorkspaceCacheSnapshot } from "./workspaceCache.js";
import { readWorkspaceIndexSummary } from "./workspaceRegistry.js";

const SEEDED_IDENTITY = {
  cacheKey: "/workspace/sample",
  workspaceRoot: "/workspace/sample",
  repoRoot: "/workspace/sample",
  repoRemote: null,
};

async function makeSeededDb(opts: {
  withFrameworks?: boolean;
  emptyCache?: boolean;
}): Promise<string> {
  const dbPath = join(tmpdir(), `dextree-ws-registry-${randomUUID()}.duckdb`);
  const db = await openDatabase(dbPath);
  try {
    await initializeSchema(db.connection);
    await applyMigrations(db.connection);

    if (!opts.emptyCache) {
      await writeWorkspaceCacheSnapshot(db.connection, {
        identity: SEEDED_IDENTITY,
        indexedFileCount: 12,
        graphNodeCount: 50,
        graphEdgeCount: 80,
      });
    }

    if (opts.withFrameworks) {
      await replaceWorkspaceFrameworks(db.connection, [
        { frameworkName: "vitest", detectionSource: "manifest", confidence: 1 },
        { frameworkName: "react", detectionSource: "manifest", confidence: 1 },
      ]);
    }
  } finally {
    db.close();
  }
  return dbPath;
}

const cleanup: string[] = [];

afterEach(() => {
  for (const p of cleanup.splice(0)) {
    try {
      rmSync(p, { force: true });
    } catch {
      // best effort
    }
  }
});

describe("readWorkspaceIndexSummary", () => {
  it("returns a populated summary from a freshly indexed DB", async () => {
    const dbPath = await makeSeededDb({ withFrameworks: true });
    cleanup.push(dbPath);

    const summary = await readWorkspaceIndexSummary(dbPath);

    expect(summary).not.toBeNull();
    expect(summary?.workspaceRoot).toBe("/workspace/sample");
    expect(summary?.name).toBe("sample");
    expect(summary?.indexedFileCount).toBe(12);
    expect(summary?.graphNodeCount).toBe(50);
    expect(summary?.graphEdgeCount).toBe(80);
    expect(summary?.lastIndexedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(summary?.frameworks).toEqual(["react", "vitest"]);
  });

  it("returns empty frameworks when the workspace_framework table has no rows", async () => {
    const dbPath = await makeSeededDb({ withFrameworks: false });
    cleanup.push(dbPath);

    const summary = await readWorkspaceIndexSummary(dbPath);

    expect(summary).not.toBeNull();
    expect(summary?.frameworks).toEqual([]);
  });

  it("returns null when the workspace_cache row is missing", async () => {
    const dbPath = await makeSeededDb({ emptyCache: true });
    cleanup.push(dbPath);

    const summary = await readWorkspaceIndexSummary(dbPath);

    expect(summary).toBeNull();
  });

  it("returns null when the file does not exist", async () => {
    const summary = await readWorkspaceIndexSummary(
      join(tmpdir(), `dextree-missing-${randomUUID()}.duckdb`),
    );

    expect(summary).toBeNull();
  });

  it("returns null when the file is not a valid DuckDB database", async () => {
    const dbPath = join(tmpdir(), `dextree-corrupt-${randomUUID()}.duckdb`);
    writeFileSync(dbPath, "not a duckdb file");
    cleanup.push(dbPath);

    const summary = await readWorkspaceIndexSummary(dbPath);

    expect(summary).toBeNull();
  });
});
