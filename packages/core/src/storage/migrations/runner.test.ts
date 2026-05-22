import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseHandle } from "../db.js";
import { initializeSchema } from "../schema.js";
import { applyMigrations } from "./runner.js";

describe("applyMigrations", () => {
  let handle: DatabaseHandle | null = null;

  beforeEach(async () => {
    handle = await openDatabase(":memory:");
    await initializeSchema(handle.connection);
  });

  afterEach(() => {
    if (handle !== null) {
      handle.close();
      handle = null;
    }
  });

  function requireHandle(): DatabaseHandle {
    if (handle === null) {
      throw new Error("test fixture failed: no DB handle");
    }
    return handle;
  }

  async function readRegistry(): Promise<Array<{ version: number; description: string }>> {
    const reader = await requireHandle().connection.run(
      "SELECT version, description FROM _schema_version ORDER BY version",
    );
    const rows = await reader.getRowObjectsJS();
    return rows.map((row) => {
      const r = row as { version: number | bigint; description: string };
      return {
        version: typeof r.version === "bigint" ? Number(r.version) : r.version,
        description: r.description,
      };
    });
  }

  it("populates the registry on a fresh DB", async () => {
    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("ok");
    const registry = await readRegistry();
    expect(registry).toContainEqual({ version: 1, description: "initial baseline" });
  });

  it("is a no-op when re-run on an already-current DB", async () => {
    await applyMigrations(requireHandle().connection);
    const before = await readRegistry();

    const second = await applyMigrations(requireHandle().connection);

    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.applied).toEqual([]);
    }
    const after = await readRegistry();
    expect(after).toEqual(before);
  });

  it("returns status: 'failed' when the persisted version is newer than supported", async () => {
    // Seed an impossibly-future version
    await requireHandle().connection.run(
      "INSERT INTO _schema_version (version, description) VALUES (99, 'from the future')",
    );

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/newer than supported/);
    }
  });

  it("treats migration 001 as idempotent on a pre-seeded v1 DB", async () => {
    // Simulate a slice-008-era DB that already has a v1 marker
    await requireHandle().connection.run(
      "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
    );

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("ok");
    const registry = await readRegistry();
    // Migration 001 used a guard, so re-running on a v1 DB does not duplicate the row
    expect(registry.filter((row) => row.version === 1)).toHaveLength(1);
  });

  it("surfaces a structured failure when reading the registry table errors", async () => {
    // Drop the registry table to provoke a read failure
    await requireHandle().connection.run("DROP TABLE _schema_version");

    const result = await applyMigrations(requireHandle().connection);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/failed to read _schema_version/);
    }
  });
});
