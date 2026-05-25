import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { openDatabase } from "../storage/db.js";
import {
  replaceFileGraph,
  replaceWorkspaceFrameworks,
  setFileFramework,
} from "../storage/repository.js";
import { applyMigrations } from "../storage/migrations/runner.js";
import { initializeSchema } from "../storage/schema.js";
import { getWorkspaceSubgraph } from "./subgraph.js";

function makeExtractedData(
  name: string,
  options?: {
    workspaceRoot?: string;
    imports?: string[];
  },
): ExtractedIndexData {
  const workspaceRoot = options?.workspaceRoot ?? "/workspace";
  const fileId = `file-${name}`;

  return {
    file: {
      id: fileId,
      path: `${workspaceRoot}/src/${name}.ts`,
      relativePath: `src/${name}.ts`,
      language: "typescript",
      loc: 3,
      hash: `hash-${name}`,
    },
    symbols: [
      {
        id: `symbol-${name}`,
        fqn: `src/${name}.ts:${name}`,
        name,
        kind: "function",
        fileId,
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 10 },
        language: "typescript",
      },
    ],
    imports: (options?.imports ?? []).map((importPath, index) => ({
      id: `import-${name}-${index}`,
      fileId,
      importPath,
      importedSymbol: null,
      range: { startLine: index, startCol: 0, endLine: index, endCol: 20 },
      language: "typescript",
    })),
  };
}

describe("getWorkspaceSubgraph", () => {
  it("returns file nodes, symbol nodes, defines edges, and imports edges for the workspace", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("beta"));
      await replaceFileGraph(
        database.connection,
        makeExtractedData("alpha", { imports: ["src/beta.ts"] }),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "file-alpha",
            type: "file",
            label: "alpha.ts",
            filePath: "/workspace/src/alpha.ts",
            startLine: 1,
          }),
          expect.objectContaining({
            id: "symbol-alpha",
            type: "symbol",
            label: "alpha",
            filePath: "/workspace/src/alpha.ts",
            startLine: 1,
            symbolKind: "function",
          }),
          expect.objectContaining({
            id: "file-beta",
            type: "file",
            label: "beta.ts",
            filePath: "/workspace/src/beta.ts",
            startLine: 1,
          }),
        ]),
      );

      expect(graph.edges).toEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            source: "file-alpha",
            target: "symbol-alpha",
            kind: "DEFINES",
          },
          {
            id: expect.any(String),
            source: "file-alpha",
            target: "file-beta",
            kind: "IMPORTS",
          },
        ]),
      );
    } finally {
      database.close();
    }
  });

  it("filters out files and symbols that are outside the workspace root", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("inside"));
      await replaceFileGraph(
        database.connection,
        makeExtractedData("outside", { workspaceRoot: "/other-workspace" }),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph.nodes.map((node) => node.filePath)).toEqual([
        "/workspace/src/inside.ts",
        "/workspace/src/inside.ts",
      ]);
      expect(graph.edges).toEqual([
        {
          id: expect.any(String),
          source: "file-inside",
          target: "symbol-inside",
          kind: "DEFINES",
        },
      ]);
    } finally {
      database.close();
    }
  });

  it("returns an empty graph when no files in the workspace have been indexed", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph).toEqual({ nodes: [], edges: [], frameworks: [] });
    } finally {
      database.close();
    }
  });

  it("populates importance on every node when the graph has 2+ nodes", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("beta"));
      await replaceFileGraph(
        database.connection,
        makeExtractedData("alpha", { imports: ["src/beta.ts"] }),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      for (const node of graph.nodes) {
        expect(typeof node.importance).toBe("number");
        expect(Number.isFinite(node.importance ?? Number.NaN)).toBe(true);
      }
    } finally {
      database.close();
    }
  });

  it("sets importance to 1 for a single-node graph (degenerate)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      // Insert a file with no symbols so the graph has exactly one node
      await database.connection.run(
        `INSERT INTO file (id, path, relative_path, language, loc, hash) VALUES
         ('only', '/workspace/src/only.ts', 'src/only.ts', 'typescript', 1, 'h')`,
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0]?.importance).toBe(1);
    } finally {
      database.close();
    }
  });

  it("reads CALLS edges from the unified edge table (post-migration-003)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);

      // Index two files; this gives us symbols and a DEFINES edge per file.
      await replaceFileGraph(database.connection, makeExtractedData("alpha"));
      await replaceFileGraph(database.connection, makeExtractedData("beta"));

      // Write a CALLS edge directly via the unified `edge` table. Post-v3, this
      // is the supported write path — no more call_site sidecar.
      await database.connection.run(
        `
          INSERT INTO edge (id, source_id, target_id, kind, weight, metadata)
          VALUES (
            'call-1',
            'symbol-alpha',
            'symbol-beta',
            'CALLS',
            NULL,
            json_object('kind', 'naive')
          )
        `,
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph.edges).toEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            source: "symbol-alpha",
            target: "symbol-beta",
            kind: "CALLS",
          },
        ]),
      );
    } finally {
      database.close();
    }
  });

  it("projects fan_in / is_core / flags / signature / docstring onto symbol nodes (slice 020)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("foo"));

      // Seed slice-020 columns directly. These columns are pass-2 / quality-pipeline
      // outputs (S8 / S11.7) that aren't populated by pass-1 extraction, so test
      // setup writes them with raw SQL UPDATE statements.
      await database.connection.run(
        `UPDATE symbol
         SET fan_in = 7,
             is_core = TRUE,
             flags = ['hot-path'],
             signature = 'function foo(): void',
             docstring = 'Does the foo.'
         WHERE id = $id`,
        { id: "symbol-foo" },
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const symbolNode = graph.nodes.find((n) => n.id === "symbol-foo");

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.fanIn).toBe(7);
      expect(symbolNode?.isCore).toBe(true);
      expect(symbolNode?.flags).toEqual(["hot-path"]);
      expect(symbolNode?.signature).toBe("function foo(): void");
      expect(symbolNode?.docstring).toBe("Does the foo.");
    } finally {
      database.close();
    }
  });

  it("maps NULL signature/docstring to undefined, never null literal (slice 020 FR-010)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("bar"));

      // No explicit UPDATE — signature/docstring stay NULL by default.

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const symbolNode = graph.nodes.find((n) => n.id === "symbol-bar");

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.signature).toBeUndefined();
      expect(symbolNode?.docstring).toBeUndefined();
      // Important: not the string "null"
      expect(symbolNode?.signature).not.toBe("null");
      expect(symbolNode?.docstring).not.toBe("null");
    } finally {
      database.close();
    }
  });

  it("does not project symbol-only columns onto file nodes (slice 020)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("baz"));

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const fileNode = graph.nodes.find((n) => n.id === "file-baz");

      expect(fileNode).toBeDefined();
      // File rows never have these columns — they should be undefined on file-type GraphNodes
      expect(fileNode?.fanIn).toBeUndefined();
      expect(fileNode?.signature).toBeUndefined();
      expect(fileNode?.docstring).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("projects workspace_framework rows and per-file framework attribution (slice 018)", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("App"));
      await replaceWorkspaceFrameworks(database.connection, [
        { frameworkName: "react", detectionSource: "manifest+structural", confidence: 1.0 },
        { frameworkName: "vitest", detectionSource: "manifest+structural", confidence: 1.0 },
      ]);
      await setFileFramework(database.connection, "file-App", "react", "component");

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");

      expect(graph.frameworks).toEqual([
        { name: "react", detectionSource: "manifest+structural", confidence: 1 },
        { name: "vitest", detectionSource: "manifest+structural", confidence: 1 },
      ]);

      const fileNode = graph.nodes.find((n) => n.id === "file-App");
      expect(fileNode).toBeDefined();
      expect(fileNode?.framework).toBe("react");
      expect(fileNode?.frameworkRole).toBe("component");
    } finally {
      database.close();
    }
  });

  it("projects entryKind / archLayer onto symbol nodes when persisted", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(
        database.connection,
        makeExtractedData("greet"),
        [],
        new Map([["symbol-greet", { entryKind: "public-api", archLayer: "application" }]]),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const symbolNode = graph.nodes.find((n) => n.id === "symbol-greet");

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.entryKind).toBe("public-api");
      expect(symbolNode?.archLayer).toBe("application");
    } finally {
      database.close();
    }
  });

  it("refreshes entryKind / archLayer on reindex (slice 026)", async () => {
    const database = await openDatabase(":memory:");

    // Local helper: a single stable file with a swappable symbol so reindex
    // can land on the same file row.
    function reindexedFile(symbolName: string): ExtractedIndexData {
      return {
        file: {
          id: "file-stable",
          path: "/workspace/src/stable.ts",
          relativePath: "src/stable.ts",
          language: "typescript",
          loc: 3,
          hash: `hash-${symbolName}`,
        },
        symbols: [
          {
            id: `symbol-${symbolName}`,
            fqn: `src/stable.ts:${symbolName}`,
            name: symbolName,
            kind: "function",
            fileId: "file-stable",
            range: { startLine: 0, startCol: 0, endLine: 0, endCol: 10 },
            language: "typescript",
          },
        ],
        imports: [],
      };
    }

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);

      await replaceFileGraph(
        database.connection,
        reindexedFile("greet"),
        [],
        new Map([["symbol-greet", { entryKind: "runtime", archLayer: "application" }]]),
      );

      await replaceFileGraph(
        database.connection,
        reindexedFile("wave"),
        [],
        new Map([["symbol-wave", { entryKind: "handler", archLayer: "presentation" }]]),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const symbolNodes = graph.nodes.filter((n) => n.type === "symbol");

      expect(symbolNodes).toHaveLength(1);
      expect(symbolNodes[0]?.id).toBe("symbol-wave");
      expect(symbolNodes[0]?.entryKind).toBe("handler");
      expect(symbolNodes[0]?.archLayer).toBe("presentation");
    } finally {
      database.close();
    }
  });

  it("file nodes never carry entryKind or archLayer", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(
        database.connection,
        makeExtractedData("greet"),
        [],
        new Map([["symbol-greet", { entryKind: "public-api", archLayer: "application" }]]),
      );

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const fileNode = graph.nodes.find((n) => n.id === "file-greet");

      expect(fileNode).toBeDefined();
      expect(fileNode?.entryKind).toBeUndefined();
      expect(fileNode?.archLayer).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("projects defaults when no classification map is provided", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await applyMigrations(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const symbolNode = graph.nodes.find((n) => n.id === "symbol-greet");

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.entryKind).toBe("unclassified");
      expect(symbolNode?.archLayer).toBe("unknown");
    } finally {
      database.close();
    }
  });
});

describe("getWorkspaceSubgraph — enclosingSymbolId projection (slice 028 US2)", () => {
  function makeClassAndMethodData(): ExtractedIndexData {
    return {
      file: {
        id: "file-animal",
        path: "/workspace/src/Animal.ts",
        relativePath: "src/Animal.ts",
        language: "typescript",
        loc: 5,
        hash: "hash-animal",
      },
      symbols: [
        {
          id: "sym-animal-class",
          fqn: "src/Animal.ts:Animal",
          name: "Animal",
          kind: "class",
          fileId: "file-animal",
          range: { startLine: 0, startCol: 0, endLine: 4, endCol: 1 },
          language: "typescript",
        },
        {
          id: "sym-animal-eat",
          fqn: "src/Animal.ts:Animal.eat",
          name: "Animal.eat",
          kind: "method",
          fileId: "file-animal",
          range: { startLine: 1, startCol: 2, endLine: 1, endCol: 20 },
          language: "typescript",
          enclosingSymbolId: "sym-animal-class",
        },
      ],
      imports: [],
    };
  }

  it("projects enclosingSymbolId onto type: symbol nodes when the parent is in scope", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeClassAndMethodData());

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const method = graph.nodes.find((n) => n.id === "sym-animal-eat");
      const cls = graph.nodes.find((n) => n.id === "sym-animal-class");

      expect(method?.type).toBe("symbol");
      expect(method?.enclosingSymbolId).toBe("sym-animal-class");
      // The class itself is top-level → undefined.
      expect(cls?.enclosingSymbolId).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("omits enclosingSymbolId for top-level symbols (no parent class)", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData("greet"));

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const top = graph.nodes.find((n) => n.id === "symbol-greet");

      expect(top?.enclosingSymbolId).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("does not set enclosingSymbolId on file nodes", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeClassAndMethodData());

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const file = graph.nodes.find((n) => n.id === "file-animal");

      expect(file?.type).toBe("file");
      expect(file?.enclosingSymbolId).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("refreshes enclosingSymbolId on reindex (a renamed method keeps pointing at the right class)", async () => {
    const database = await openDatabase(":memory:");
    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeClassAndMethodData());

      const renamed = makeClassAndMethodData();
      renamed.file.hash = "hash-animal-v2";
      renamed.symbols[1] = {
        ...renamed.symbols[1]!,
        id: "sym-animal-feed",
        name: "Animal.feed",
        fqn: "src/Animal.ts:Animal.feed",
        enclosingSymbolId: "sym-animal-class",
      };
      await replaceFileGraph(database.connection, renamed);

      const graph = await getWorkspaceSubgraph(database.connection, "/workspace");
      const feed = graph.nodes.find((n) => n.id === "sym-animal-feed");
      expect(feed?.enclosingSymbolId).toBe("sym-animal-class");

      // The old eat method id is gone.
      expect(graph.nodes.find((n) => n.id === "sym-animal-eat")).toBeUndefined();
    } finally {
      database.close();
    }
  });
});
