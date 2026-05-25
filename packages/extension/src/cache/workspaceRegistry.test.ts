/**
 * Tests for the global workspace registry (slice 024 — workspace switcher).
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listIndexedWorkspaces,
  readWorkspaceRegistry,
  registerWorkspace,
  type WorkspaceRegistry,
} from "./workspaceRegistry.js";

vi.mock("@dextree/core", () => ({
  readWorkspaceIndexSummary: vi.fn(),
}));

import { readWorkspaceIndexSummary } from "@dextree/core";

const mockedReadSummary = vi.mocked(readWorkspaceIndexSummary);

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), `dextree-registry-${randomUUID()}-`));
  mockedReadSummary.mockReset();
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

describe("readWorkspaceRegistry", () => {
  it("returns an empty registry when the file does not exist", async () => {
    const registry = await readWorkspaceRegistry(scratchDir);

    expect(registry).toEqual({ version: 1, entries: [] });
  });

  it("returns an empty registry when the file is malformed JSON", async () => {
    await writeFile(join(scratchDir, "workspace-registry.json"), "not-json{", "utf8");

    const registry = await readWorkspaceRegistry(scratchDir);

    expect(registry).toEqual({ version: 1, entries: [] });
  });

  it("returns an empty registry when the file shape is unexpected", async () => {
    await writeFile(
      join(scratchDir, "workspace-registry.json"),
      JSON.stringify({ version: 99, somethingElse: true }),
      "utf8",
    );

    const registry = await readWorkspaceRegistry(scratchDir);

    expect(registry).toEqual({ version: 1, entries: [] });
  });

  it("reads back a previously written registry", async () => {
    const seed: WorkspaceRegistry = {
      version: 1,
      entries: [
        { workspaceRoot: "/a/dextree", dbPath: "/a/.storage/dextree.db", registeredAt: "x" },
      ],
    };
    await writeFile(join(scratchDir, "workspace-registry.json"), JSON.stringify(seed), "utf8");

    const registry = await readWorkspaceRegistry(scratchDir);

    expect(registry).toEqual(seed);
  });
});

describe("registerWorkspace", () => {
  it("creates the registry file on first call", async () => {
    await registerWorkspace(scratchDir, "/a/dextree", "/a/.storage/dextree.db");

    const written = await readFile(join(scratchDir, "workspace-registry.json"), "utf8");
    const parsed: unknown = JSON.parse(written);
    expect(parsed).toMatchObject({
      version: 1,
      entries: [
        expect.objectContaining({
          workspaceRoot: "/a/dextree",
          dbPath: "/a/.storage/dextree.db",
        }),
      ],
    });
  });

  it("appends a new entry when the workspaceRoot is new", async () => {
    await registerWorkspace(scratchDir, "/a/dextree", "/a/.storage/dextree.db");
    await registerWorkspace(scratchDir, "/b/widgets", "/b/.storage/widgets.db");

    const registry = await readWorkspaceRegistry(scratchDir);
    expect(registry.entries.map((e) => e.workspaceRoot).sort()).toEqual([
      "/a/dextree",
      "/b/widgets",
    ]);
  });

  it("deduplicates by workspaceRoot — re-registering replaces the existing entry", async () => {
    await registerWorkspace(scratchDir, "/a/dextree", "/old/path.db");
    await registerWorkspace(scratchDir, "/a/dextree", "/new/path.db");

    const registry = await readWorkspaceRegistry(scratchDir);
    expect(registry.entries.length).toBe(1);
    expect(registry.entries[0]?.dbPath).toBe("/new/path.db");
  });
});

describe("listIndexedWorkspaces", () => {
  it("returns an empty array when the registry is empty", async () => {
    const records = await listIndexedWorkspaces(scratchDir, "/a/dextree");

    expect(records).toEqual([]);
  });

  it("returns one record per registry entry whose DB is readable", async () => {
    await registerWorkspace(scratchDir, "/a/dextree", "/a/db");
    await registerWorkspace(scratchDir, "/b/widgets", "/b/db");

    mockedReadSummary.mockImplementation(async (dbPath: string) => {
      const root = dbPath === "/a/db" ? "/a/dextree" : "/b/widgets";
      return {
        workspaceRoot: root,
        name: root.split("/").pop()!,
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 3,
        lastIndexedAt: "2026-05-25T00:00:00.000Z",
        frameworks: [],
      };
    });

    const records = await listIndexedWorkspaces(scratchDir, "/a/dextree");

    expect(records.length).toBe(2);
    const active = records.find((r) => r.workspaceRoot === "/a/dextree");
    expect(active?.isActive).toBe(true);
    const inactive = records.find((r) => r.workspaceRoot === "/b/widgets");
    expect(inactive?.isActive).toBe(false);
  });

  it("silently excludes registry entries whose DB cannot be read", async () => {
    await registerWorkspace(scratchDir, "/a/dextree", "/a/db");
    await registerWorkspace(scratchDir, "/b/broken", "/b/missing.db");

    mockedReadSummary.mockImplementation(async (dbPath: string) => {
      if (dbPath === "/b/missing.db") return null;
      return {
        workspaceRoot: "/a/dextree",
        name: "dextree",
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 3,
        lastIndexedAt: null,
        frameworks: [],
      };
    });

    const records = await listIndexedWorkspaces(scratchDir, "/a/dextree");

    expect(records.length).toBe(1);
    expect(records[0]?.workspaceRoot).toBe("/a/dextree");
  });
});
