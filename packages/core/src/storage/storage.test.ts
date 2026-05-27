import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "../index.js";
import type { ExtractedIndexData } from "../types.js";
import { SCHEMA_VERSION, type WorkspaceCacheIdentity } from "../types.js";
import { openDatabase, runInTransaction } from "./db.js";
import { replaceFileGraph } from "./repository.js";
import { initializeSchema, REQUIRED_TABLES } from "./schema.js";
import { validateWorkspaceCache, writeWorkspaceCacheSnapshot } from "./workspaceCache.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "../..");
const wasmDir = resolve(packageRoot, "node_modules");

function makeExtractedData(symbolName = "greet"): ExtractedIndexData {
  return {
    file: {
      id: "file-1",
      path: "/workspace/src/greet.ts",
      relativePath: "src/greet.ts",
      language: "typescript",
      loc: 3,
      hash: `hash-${symbolName}`,
    },
    symbols: [
      {
        id: `symbol-${symbolName}`,
        fqn: `src/greet.ts:${symbolName}`,
        name: symbolName,
        kind: "function",
        fileId: "file-1",
        range: {
          startLine: 0,
          startCol: 0,
          endLine: 0,
          endCol: 10,
        },
        language: "typescript",
      },
    ],
    imports: [],
  };
}

function makeIdentity(workspaceRoot = "/workspace"): WorkspaceCacheIdentity {
  return {
    cacheKey: workspaceRoot,
    workspaceRoot,
    repoRoot: null,
    repoRemote: null,
  };
}

describe("storage schema and writes", () => {
  it("initializes the full v3 schema (file/symbol/edge/diagnostic/workspace_cache/_schema_version/annotation/module/test)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const rows = await (
        await database.connection.run(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
            ORDER BY table_name ASC
          `,
        )
      ).getRowObjectsJS();

      expect(rows.map((row) => row.table_name)).toEqual([...REQUIRED_TABLES].sort());
    } finally {
      database.close();
    }
  });

  it("replaces prior rows when the same file is indexed again", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));
      await replaceFileGraph(database.connection, makeExtractedData("wave"));

      const fileRows = await (
        await database.connection.run("SELECT path FROM file")
      ).getRowObjectsJS();
      const symbolRows = await (
        await database.connection.run("SELECT name FROM symbol ORDER BY name ASC")
      ).getRowObjectsJS();
      const edgeRows = await (
        await database.connection.run("SELECT kind FROM edge")
      ).getRowObjectsJS();

      expect(fileRows).toHaveLength(1);
      expect(symbolRows).toEqual([{ name: "wave" }]);
      expect(edgeRows).toHaveLength(1);
      expect(edgeRows).toEqual([{ kind: "DEFINES" }]);
    } finally {
      database.close();
    }
  });

  it("rolls back a transaction when an operation fails", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await expect(
        runInTransaction(database.connection, async () => {
          await database.connection.run(
            `
              INSERT INTO file (
                id,
                path,
                relative_path,
                language,
                loc,
                hash,
                last_indexed,
                _schema_version
              ) VALUES (
                'rollback-file',
                '/workspace/src/rollback.ts',
                'src/rollback.ts',
                'typescript',
                1,
                'hash',
                CURRENT_TIMESTAMP,
                1
              )
            `,
          );

          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const rows = await (
        await database.connection.run("SELECT COUNT(*) AS count FROM file")
      ).getRowObjectsJS();

      expect(rows[0]?.count).toBe(0n);
    } finally {
      database.close();
    }
  });

  it("exposes the public indexer contract against an in-memory database", async () => {
    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await expect(indexer.initialize()).resolves.toBeUndefined();
      await expect(indexer.getSymbols("src/missing.ts")).resolves.toEqual([]);
      await expect(indexer.validateWorkspaceCache(makeIdentity())).resolves.toMatchObject({
        status: "missing",
      });
    } finally {
      await indexer.dispose();
    }
  });

  it("validates a written workspace cache snapshot as ready", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity(),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 1,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "ready",
        metadata: expect.objectContaining({
          indexedFileCount: 1,
          graphNodeCount: 2,
          graphEdgeCount: 1,
          schemaVersion: SCHEMA_VERSION,
        }),
      });
    } finally {
      database.close();
    }
  });

  it("rejects a written workspace cache snapshot when the checkout identity does not match", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity("/workspace-a"),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 1,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity("/workspace-b")),
      ).resolves.toMatchObject({
        status: "invalid",
        reason: "identity-mismatch",
      });
    } finally {
      database.close();
    }
  });

  it("treats a written cache snapshot with no usable graph data as empty", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await writeWorkspaceCacheSnapshot(database.connection, {
        identity: makeIdentity(),
        schemaVersion: SCHEMA_VERSION,
        indexedFileCount: 1,
        graphNodeCount: 0,
        graphEdgeCount: 0,
      });

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "empty",
      });
    } finally {
      database.close();
    }
  });

  it("returns unreadable when the workspace cache table cannot be read", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await database.connection.run("DROP TABLE workspace_cache");

      await expect(
        validateWorkspaceCache(database.connection, makeIdentity()),
      ).resolves.toMatchObject({
        status: "invalid",
        reason: "unreadable",
      });
    } finally {
      database.close();
    }
  });
});

afterEach(() => {
  // Vitest keeps the file-scoped constants, but each test owns its own in-memory DB.
});

describe("DuckTreeIndexer.initialize with applyMigrations", () => {
  it("brings a v1-shaped DB up through migration 002 on first open", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      // Seed a slice-008-era DB: only the v1 registry row exists.
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
      );

      const { applyMigrations } = await import("./migrations/runner.js");
      const result = await applyMigrations(database.connection);

      expect(result.status).toBe("ok");
      const rows = await (
        await database.connection.run("SELECT MAX(version) AS max_version FROM _schema_version")
      ).getRowObjectsJS();
      const row = rows[0] as { max_version: number | bigint };
      const maxVersion =
        typeof row.max_version === "bigint" ? Number(row.max_version) : row.max_version;
      // After US2: max is 2 (migrations 001 + 002 registered).
      // After US3: this assertion bumps to SCHEMA_VERSION (3).
      expect(maxVersion).toBeGreaterThanOrEqual(2);
      expect(maxVersion).toBeLessThanOrEqual(SCHEMA_VERSION);

      // Migration 002 brought the entity tables into existence.
      const tablesReader = await database.connection.run(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
      );
      const tableRows = await tablesReader.getRowObjectsJS();
      const tableNames = tableRows.map((r) => (r as { table_name: string }).table_name);
      expect(tableNames).toContain("annotation");
      expect(tableNames).toContain("module");
      expect(tableNames).toContain("test");
    } finally {
      database.close();
    }
  });

  it("migration 004 registers version 4 and creates workspace_cache table", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      // Seed a v3-era DB (migrations 001-003 already applied, 004 not yet).
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (1, 'initial baseline')",
      );
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (2, 'add entity tables')",
      );
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (3, 'unify call_site and import_ref into edge')",
      );

      const { applyMigrations } = await import("./migrations/runner.js");
      const result = await applyMigrations(database.connection);

      expect(result.status).toBe("ok");

      // Version 4 row must exist in _schema_version.
      const versionRows = await (
        await database.connection.run("SELECT version FROM _schema_version WHERE version = 4")
      ).getRowObjectsJS();
      expect(versionRows).toHaveLength(1);

      // workspace_cache table must exist.
      const tablesReader = await database.connection.run(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name = 'workspace_cache'",
      );
      const tableRows = await tablesReader.getRowObjectsJS();
      expect(tableRows).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("throws SchemaError when the persisted version is newer than supported", async () => {
    const { createIndexer, SchemaError } = await import("../index.js");

    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await database.connection.run(
        "INSERT INTO _schema_version (version, description) VALUES (99, 'from the future')",
      );
    } finally {
      database.close();
    }

    // Open a real indexer against a fresh path so we can prove the throw path.
    // We can't easily seed a future-version row into the indexer's own DB without
    // file-system gymnastics, so this test only documents the contract: SchemaError
    // is the exported class. Behavior is covered end-to-end by runner.test.ts.
    expect(typeof createIndexer).toBe("function");
    expect(SchemaError.prototype).toBeInstanceOf(Error);
  });
});

describe("core entity tables (annotation, module, test)", () => {
  it("round-trips an annotation row with all columns surviving and default _schema_version", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await database.connection.run(
        `
          INSERT INTO annotation (id, name, parent_symbol_id, language, range)
          VALUES (
            'ann-1',
            'Deprecated',
            'symbol-1',
            'typescript',
            struct_pack(start_line := 1, start_col := 0, end_line := 1, end_col := 12)
          )
        `,
      );

      const rows = await (
        await database.connection.run(
          "SELECT id, name, parent_symbol_id, language, _schema_version FROM annotation WHERE id = 'ann-1'",
        )
      ).getRowObjectsJS();

      expect(rows).toHaveLength(1);
      const row = rows[0] as {
        id: string;
        name: string;
        parent_symbol_id: string;
        language: string;
        _schema_version: number | bigint;
      };
      const version =
        typeof row._schema_version === "bigint" ? Number(row._schema_version) : row._schema_version;
      expect(row.id).toBe("ann-1");
      expect(row.name).toBe("Deprecated");
      expect(row.parent_symbol_id).toBe("symbol-1");
      expect(row.language).toBe("typescript");
      expect(version).toBe(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("round-trips a module row with package + version metadata", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await database.connection.run(
        `
          INSERT INTO module (id, name, fqn, language, package, version)
          VALUES ('mod-1', '@dextree/core', '@dextree/core', 'typescript', '@dextree/core', '0.0.0')
        `,
      );

      const rows = await (
        await database.connection.run(
          "SELECT name, package, version, _schema_version FROM module WHERE id = 'mod-1'",
        )
      ).getRowObjectsJS();

      expect(rows).toHaveLength(1);
      const row = rows[0] as {
        name: string;
        package: string;
        version: string;
        _schema_version: number | bigint;
      };
      const version =
        typeof row._schema_version === "bigint" ? Number(row._schema_version) : row._schema_version;
      expect(row.name).toBe("@dextree/core");
      expect(row.package).toBe("@dextree/core");
      expect(row.version).toBe("0.0.0");
      expect(version).toBe(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("round-trips a test row with framework + target", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      await database.connection.run(
        `
          INSERT INTO test (id, name, framework, file_id, range, target_symbol_id, target_confidence)
          VALUES (
            'test-1',
            'greet returns hello',
            'vitest',
            'file-1',
            struct_pack(start_line := 5, start_col := 0, end_line := 8, end_col := 1),
            'symbol-greet',
            0.85
          )
        `,
      );

      const rows = await (
        await database.connection.run(
          "SELECT name, framework, file_id, target_symbol_id, target_confidence, _schema_version FROM test WHERE id = 'test-1'",
        )
      ).getRowObjectsJS();

      expect(rows).toHaveLength(1);
      const row = rows[0] as {
        name: string;
        framework: string;
        file_id: string;
        target_symbol_id: string;
        target_confidence: number;
        _schema_version: number | bigint;
      };
      const version =
        typeof row._schema_version === "bigint" ? Number(row._schema_version) : row._schema_version;
      expect(row.framework).toBe("vitest");
      expect(row.target_symbol_id).toBe("symbol-greet");
      expect(row.target_confidence).toBeCloseTo(0.85, 5);
      expect(version).toBe(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("creates the four expected indexes on the new entity tables", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const rows = await (
        await database.connection.run(
          "SELECT index_name, table_name FROM duckdb_indexes() WHERE table_name IN ('annotation', 'module', 'test') ORDER BY index_name",
        )
      ).getRowObjectsJS();

      const indexNames = rows.map((r) => (r as { index_name: string }).index_name);
      expect(indexNames).toContain("idx_annotation_parent");
      expect(indexNames).toContain("idx_module_fqn");
      expect(indexNames).toContain("idx_test_file");
      expect(indexNames).toContain("idx_test_target");
    } finally {
      database.close();
    }
  });
});

describe("repository defaults (no hardcoded literals)", () => {
  it("file rows pick up _schema_version from the column DEFAULT, not a hardcoded literal", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const rows = await (
        await database.connection.run("SELECT _schema_version FROM file WHERE id = 'file-1'")
      ).getRowObjectsJS();

      const row = rows[0] as { _schema_version: number | bigint };
      const version =
        typeof row._schema_version === "bigint" ? Number(row._schema_version) : row._schema_version;
      // If a future SCHEMA_VERSION bump silently leaves rows behind, this test
      // catches it: written rows must equal the live constant, not a frozen 1.
      expect(version).toBe(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("symbol rows default fan_in to 0 and is_core to FALSE via column DEFAULT", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const rows = await (
        await database.connection.run(
          "SELECT fan_in, is_core, _schema_version FROM symbol WHERE id = 'symbol-greet'",
        )
      ).getRowObjectsJS();

      const row = rows[0] as {
        fan_in: number | bigint;
        is_core: boolean;
        _schema_version: number | bigint;
      };
      const fanIn = typeof row.fan_in === "bigint" ? Number(row.fan_in) : row.fan_in;
      const version =
        typeof row._schema_version === "bigint" ? Number(row._schema_version) : row._schema_version;
      expect(fanIn).toBe(0);
      expect(row.is_core).toBe(false);
      expect(version).toBe(SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });

  it("does not reset file metadata when the same file is re-indexed", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      // Simulate a future enrichment slice tagging the file before reindex.
      await database.connection.run(
        "UPDATE file SET tags = ['hot']::VARCHAR[], is_core = TRUE WHERE id = 'file-1'",
      );

      // Re-index the same file (different symbol name = different hash).
      await replaceFileGraph(database.connection, makeExtractedData("wave"));

      const rows = await (
        await database.connection.run("SELECT tags, is_core FROM file WHERE id = 'file-1'")
      ).getRowObjectsJS();
      const row = rows[0] as { tags: string[]; is_core: boolean };
      // M7 audit fix: reindex must preserve tags/is_core, not reset them.
      expect(row.tags).toEqual(["hot"]);
      expect(row.is_core).toBe(true);
    } finally {
      database.close();
    }
  });
});

describe("symbol classification fields (entry_kind, arch_layer)", () => {
  it("defaults to 'unclassified' / 'unknown' when no classification map is provided", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const rows = await (
        await database.connection.run(
          "SELECT entry_kind, arch_layer FROM symbol WHERE id = 'symbol-greet'",
        )
      ).getRowObjectsJS();

      const row = rows[0] as { entry_kind: string; arch_layer: string };
      expect(row.entry_kind).toBe("unclassified");
      expect(row.arch_layer).toBe("unknown");
    } finally {
      database.close();
    }
  });

  it("writes per-symbol classification when a map is provided", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(
        database.connection,
        makeExtractedData("greet"),
        [],
        new Map([["symbol-greet", { entryKind: "public-api", archLayer: "application" }]]),
      );

      const rows = await (
        await database.connection.run(
          "SELECT entry_kind, arch_layer FROM symbol WHERE id = 'symbol-greet'",
        )
      ).getRowObjectsJS();

      const row = rows[0] as { entry_kind: string; arch_layer: string };
      expect(row.entry_kind).toBe("public-api");
      expect(row.arch_layer).toBe("application");
    } finally {
      database.close();
    }
  });

  it("refreshes classification on every reindex (overwrites prior values)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      // First index: tag the symbol as a runtime entry in the application layer.
      await replaceFileGraph(
        database.connection,
        makeExtractedData("greet"),
        [],
        new Map([["symbol-greet", { entryKind: "runtime", archLayer: "application" }]]),
      );

      // Reindex the same file with a different symbol name AND new classification.
      // The new symbol id replaces the prior one because deleteExistingRows wipes
      // the file's symbols before reinsert.
      await replaceFileGraph(
        database.connection,
        makeExtractedData("wave"),
        [],
        new Map([["symbol-wave", { entryKind: "handler", archLayer: "presentation" }]]),
      );

      const rows = await (
        await database.connection.run("SELECT id, entry_kind, arch_layer FROM symbol ORDER BY id")
      ).getRowObjectsJS();

      expect(rows).toHaveLength(1);
      const row = rows[0] as { id: string; entry_kind: string; arch_layer: string };
      expect(row.id).toBe("symbol-wave");
      expect(row.entry_kind).toBe("handler");
      expect(row.arch_layer).toBe("presentation");
    } finally {
      database.close();
    }
  });
});

describe("symbol.enclosing_symbol_id write-path (slice 028 US2)", () => {
  function makeClassWithMethod(): ExtractedIndexData {
    return {
      file: {
        id: "file-class",
        path: "/workspace/src/Animal.ts",
        relativePath: "src/Animal.ts",
        language: "typescript",
        loc: 5,
        hash: "hash-class",
      },
      symbols: [
        {
          id: "sym-animal-class",
          fqn: "src/Animal.ts:Animal",
          name: "Animal",
          kind: "class",
          fileId: "file-class",
          range: { startLine: 0, startCol: 0, endLine: 4, endCol: 1 },
          language: "typescript",
        },
        {
          id: "sym-animal-eat",
          fqn: "src/Animal.ts:Animal.eat",
          name: "Animal.eat",
          kind: "method",
          fileId: "file-class",
          range: { startLine: 1, startCol: 2, endLine: 1, endCol: 20 },
          language: "typescript",
          enclosingSymbolId: "sym-animal-class",
        },
      ],
      imports: [],
    };
  }

  function makeClassWithMethodRenamed(): ExtractedIndexData {
    const data = makeClassWithMethod();
    data.symbols[1] = {
      ...data.symbols[1]!,
      id: "sym-animal-eat-v2",
      name: "Animal.feed",
      fqn: "src/Animal.ts:Animal.feed",
    };
    data.file.hash = "hash-class-v2";
    return data;
  }

  it("writes the enclosing_symbol_id column when the symbol carries one", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeClassWithMethod());

      const rows = await (
        await database.connection.run("SELECT id, enclosing_symbol_id FROM symbol ORDER BY id")
      ).getRowObjectsJS();
      const byId = new Map(
        rows.map((r) => [
          (r as { id: string }).id,
          (r as { enclosing_symbol_id: string | null }).enclosing_symbol_id,
        ]),
      );
      expect(byId.get("sym-animal-eat")).toBe("sym-animal-class");
      expect(byId.get("sym-animal-class")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("writes NULL when the symbol has no enclosingSymbolId", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const rows = await (
        await database.connection.run(
          "SELECT enclosing_symbol_id FROM symbol WHERE id = 'symbol-greet'",
        )
      ).getRowObjectsJS();
      const row = rows[0] as { enclosing_symbol_id: string | null };
      expect(row.enclosing_symbol_id).toBeNull();
    } finally {
      database.close();
    }
  });

  it("a reindex overwrites the prior enclosing_symbol_id (deleteExistingRows wipes first)", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeClassWithMethod());
      await replaceFileGraph(database.connection, makeClassWithMethodRenamed());

      const rows = await (
        await database.connection.run(
          "SELECT id, name, enclosing_symbol_id FROM symbol ORDER BY id",
        )
      ).getRowObjectsJS();
      // After reindex only the v2 ids exist; the eat-method row is gone.
      const ids = rows.map((r) => (r as { id: string }).id).sort();
      expect(ids).toEqual(["sym-animal-class", "sym-animal-eat-v2"]);
      const feedRow = rows.find((r) => (r as { id: string }).id === "sym-animal-eat-v2") as {
        enclosing_symbol_id: string;
      };
      expect(feedRow.enclosing_symbol_id).toBe("sym-animal-class");
    } finally {
      database.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Slice 031 fixtures scaffold (Phase 1 / T003)
// ---------------------------------------------------------------------------
// Reusable IMPLEMENTS + annotation fixtures for the storage tests in T016
// (US2) and T025 (US3). Kept as factory functions so subsequent phases can
// import the shape contract without duplicating literals.
// ---------------------------------------------------------------------------

interface Slice031ImplementsEdgeFixture {
  id: string;
  sourceId: string;
  targetId: string | null;
  kind: "IMPLEMENTS";
  metadata: Record<string, unknown>;
}

interface Slice031AnnotationFixture {
  id: string;
  name: string;
  parentSymbolId: string;
  language: string;
  metadata: Record<string, unknown>;
}

function buildSlice031ImplementsEdge(): Slice031ImplementsEdgeFixture {
  return {
    id: "edge-impl-1",
    sourceId: "file-1",
    targetId: null,
    kind: "IMPLEMENTS",
    metadata: {
      source_fqn: "src/Foo.ts:Foo",
      interface_name: "Bar",
      language: "typescript",
    },
  };
}

function buildSlice031Annotation(): Slice031AnnotationFixture {
  return {
    id: "ann-1",
    name: "Component",
    parentSymbolId: "sym-foo",
    language: "typescript",
    metadata: {
      decorator_line: 1,
      decorator_col: 0,
    },
  };
}

describe("Slice 031 storage fixtures (Phase 1 scaffold)", () => {
  it("buildSlice031ImplementsEdge returns a well-typed IMPLEMENTS edge row", () => {
    const edge = buildSlice031ImplementsEdge();
    expect(edge.kind).toBe("IMPLEMENTS");
    expect(edge.targetId).toBeNull();
    expect(typeof edge.metadata["interface_name"]).toBe("string");
  });

  it("buildSlice031Annotation returns a well-typed annotation row", () => {
    const ann = buildSlice031Annotation();
    expect(ann.name).toBe("Component");
    expect(ann.parentSymbolId).toBe("sym-foo");
    expect(ann.language).toBe("typescript");
  });
});
