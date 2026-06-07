import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../../types.js";
import { openDatabase } from "../db.js";
import { DuckDbGraphRepository } from "./duckdbGraphRepository.js";

function makeExtractedData(name: string, workspaceRoot = "/workspace"): ExtractedIndexData {
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
    imports: [],
  };
}

async function freshRepo() {
  const database = await openDatabase(":memory:");
  const repo = new DuckDbGraphRepository(database);
  await repo.initializeSchema();
  return { database, repo };
}

describe("DuckDbGraphRepository (real DuckDB)", () => {
  it("write + read round-trips through the adapter without a passed connection", async () => {
    const { database, repo } = await freshRepo();
    try {
      await repo.replaceFileGraph(makeExtractedData("alpha"));

      const files = await repo.getAllFiles();
      expect(files.map((f) => f.relativePath)).toEqual(["src/alpha.ts"]);

      const symbols = await repo.getSymbolsForFile("src/alpha.ts");
      expect(symbols.map((s) => s.name)).toEqual(["alpha"]);

      const subgraph = await repo.getWorkspaceSubgraph("/workspace");
      expect(subgraph.nodes.length).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  });

  it("delegates clearWorkspace to the same result the bare function returns", async () => {
    const { database, repo } = await freshRepo();
    try {
      await repo.replaceFileGraph(makeExtractedData("alpha"));
      await repo.replaceFileGraph(makeExtractedData("beta"));

      const summary = await repo.clearWorkspace("/workspace");
      // deletedEdges is 2: replaceFileGraph synthesizes one DEFINES edge per file.
      expect(summary).toEqual({ deletedFiles: 2, deletedSymbols: 2, deletedEdges: 2 });

      expect(await repo.getAllFiles()).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("clearFile removes a single file's symbols", async () => {
    const { database, repo } = await freshRepo();
    try {
      await repo.replaceFileGraph(makeExtractedData("alpha"));
      await repo.replaceFileGraph(makeExtractedData("beta"));

      // clearFile matches on the absolute stored path (what the watcher passes),
      // not the relative path the read methods use.
      const summary = await repo.clearFile("/workspace/src/alpha.ts");
      expect(summary.deletedFiles).toBe(1);
      expect((await repo.getAllFiles()).map((f) => f.relativePath)).toEqual(["src/beta.ts"]);
    } finally {
      database.close();
    }
  });

  it("getCoverageReport and getPresentEdgeKinds run via the adapter", async () => {
    const { database, repo } = await freshRepo();
    try {
      await repo.replaceFileGraph(makeExtractedData("alpha"));
      await expect(repo.getCoverageReport()).resolves.toBeDefined();
      await expect(repo.getPresentEdgeKinds("/workspace")).resolves.toBeInstanceOf(Array);
    } finally {
      database.close();
    }
  });

  it("dispose() closes the underlying handle", async () => {
    const database = await openDatabase(":memory:");
    let closed = false;
    const closeSpy = database.close.bind(database);
    database.close = () => {
      closed = true;
      closeSpy();
    };
    const repo = new DuckDbGraphRepository(database);
    repo.dispose();
    expect(closed).toBe(true);
  });
});
