import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { openDatabase } from "../storage/db.js";
import { replaceFileGraph } from "../storage/repository.js";
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

      expect(graph).toEqual({ nodes: [], edges: [] });
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
});
