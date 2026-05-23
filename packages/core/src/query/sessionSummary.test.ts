import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseHandle } from "../storage/db.js";
import { initializeSchema } from "../storage/schema.js";
import { EmptyGraphError } from "../types.js";
import { querySessionSummary } from "./sessionSummary.js";

async function seedGraph(
  db: DatabaseHandle,
  files: Array<{ id: string; path: string; relativePath: string }>,
  symbols: Array<{ id: string; fileId: string }>,
  edges: Array<{ id: string; kind: string }>,
): Promise<void> {
  for (const f of files) {
    await db.connection.run(
      `INSERT INTO file (id, path, relative_path, language, loc, hash)
       VALUES ('${f.id}', '${f.path}', '${f.relativePath}', 'typescript', 0, 'abc')`,
    );
  }
  for (const s of symbols) {
    await db.connection.run(
      `INSERT INTO symbol (id, fqn, name, kind, file_id, range, language)
       VALUES ('${s.id}', 'fqn.${s.id}', '${s.id}', 'function', '${s.fileId}',
               {'start_line':1,'start_col':0,'end_line':1,'end_col':10}, 'typescript')`,
    );
  }
  for (const e of edges) {
    await db.connection.run(
      `INSERT INTO edge (id, source_id, kind) VALUES ('${e.id}', 's1', '${e.kind}')`,
    );
  }
}

describe("querySessionSummary", () => {
  let db: DatabaseHandle;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    await initializeSchema(db.connection);
  });

  afterEach(() => {
    db.close();
  });

  it("throws EmptyGraphError when no files are indexed", async () => {
    await expect(querySessionSummary(db.connection, "/workspace/proj")).rejects.toThrow(
      EmptyGraphError,
    );
  });

  it("throws EmptyGraphError with correct message", async () => {
    await expect(querySessionSummary(db.connection, "/workspace/proj")).rejects.toThrow(
      "No files have been indexed",
    );
  });

  it("returns correct fileCount and symbolCount for a single file", async () => {
    await seedGraph(
      db,
      [{ id: "f1", path: "/workspace/proj/src/index.ts", relativePath: "src/index.ts" }],
      [
        { id: "s1", fileId: "f1" },
        { id: "s2", fileId: "f1" },
      ],
      [],
    );

    const summary = await querySessionSummary(db.connection, "/workspace/proj");
    expect(summary.fileCount).toBe(1);
    expect(summary.symbolCount).toBe(2);
  });

  it("sets workspaceName to the basename of workspaceRoot", async () => {
    await seedGraph(
      db,
      [{ id: "f1", path: "/workspace/my-project/a.ts", relativePath: "a.ts" }],
      [],
      [],
    );

    const summary = await querySessionSummary(db.connection, "/workspace/my-project");
    expect(summary.workspaceName).toBe("my-project");
  });

  it("sets generatedAt to a recent Date", async () => {
    const before = new Date();
    await seedGraph(db, [{ id: "f1", path: "/workspace/proj/a.ts", relativePath: "a.ts" }], [], []);
    const summary = await querySessionSummary(db.connection, "/workspace/proj");
    expect(summary.generatedAt).toBeInstanceOf(Date);
    expect(summary.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("topFiles is sorted descending by symbolCount", async () => {
    await seedGraph(
      db,
      [
        { id: "f1", path: "/w/a.ts", relativePath: "a.ts" },
        { id: "f2", path: "/w/b.ts", relativePath: "b.ts" },
        { id: "f3", path: "/w/c.ts", relativePath: "c.ts" },
      ],
      [
        { id: "s1", fileId: "f1" },
        { id: "s2", fileId: "f3" },
        { id: "s3", fileId: "f3" },
        { id: "s4", fileId: "f3" },
      ],
      [],
    );

    const summary = await querySessionSummary(db.connection, "/w");
    expect(summary.topFiles[0]?.symbolCount).toBeGreaterThanOrEqual(
      summary.topFiles[1]?.symbolCount ?? 0,
    );
    expect(summary.topFiles[0]?.path).toBe("c.ts");
  });

  it("topFiles is capped at 10 rows", async () => {
    const files = Array.from({ length: 15 }, (_, i) => ({
      id: `f${i}`,
      path: `/w/file${i}.ts`,
      relativePath: `file${i}.ts`,
    }));
    const symbols = files.map((f, i) => ({ id: `s${i}`, fileId: f.id }));
    await seedGraph(db, files, symbols, []);

    const summary = await querySessionSummary(db.connection, "/w");
    expect(summary.topFiles.length).toBeLessThanOrEqual(10);
  });

  it("topFiles includes files with zero symbols", async () => {
    await seedGraph(db, [{ id: "f1", path: "/w/empty.ts", relativePath: "empty.ts" }], [], []);

    const summary = await querySessionSummary(db.connection, "/w");
    expect(summary.topFiles.length).toBe(1);
    expect(summary.topFiles[0]?.symbolCount).toBe(0);
  });

  it("edgeKindCounts is empty when no edges exist", async () => {
    await seedGraph(db, [{ id: "f1", path: "/w/a.ts", relativePath: "a.ts" }], [], []);

    const summary = await querySessionSummary(db.connection, "/w");
    expect(summary.edgeKindCounts).toEqual([]);
  });

  it("edgeKindCounts groups edges by kind with correct counts", async () => {
    await seedGraph(
      db,
      [{ id: "f1", path: "/w/a.ts", relativePath: "a.ts" }],
      [{ id: "s1", fileId: "f1" }],
      [
        { id: "e1", kind: "CALLS" },
        { id: "e2", kind: "CALLS" },
        { id: "e3", kind: "IMPORTS" },
      ],
    );

    const summary = await querySessionSummary(db.connection, "/w");
    const calls = summary.edgeKindCounts.find((e) => e.kind === "CALLS");
    const imports = summary.edgeKindCounts.find((e) => e.kind === "IMPORTS");
    expect(calls?.count).toBe(2);
    expect(imports?.count).toBe(1);
  });

  it("edgeKindCounts is sorted descending by count", async () => {
    await seedGraph(
      db,
      [{ id: "f1", path: "/w/a.ts", relativePath: "a.ts" }],
      [{ id: "s1", fileId: "f1" }],
      [
        { id: "e1", kind: "IMPORTS" },
        { id: "e2", kind: "CALLS" },
        { id: "e3", kind: "CALLS" },
        { id: "e4", kind: "CALLS" },
      ],
    );

    const summary = await querySessionSummary(db.connection, "/w");
    expect(summary.edgeKindCounts[0]?.kind).toBe("CALLS");
    expect(summary.edgeKindCounts[0]?.count).toBe(3);
  });
});
