import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { FakeGraphRepository } from "./fakeGraphRepository.js";
import type { GraphRepository } from "./graphRepository.js";

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

describe("FakeGraphRepository (substitutability)", () => {
  // The fake is consumed only through the interface — if it satisfies
  // GraphRepository structurally and behaves, the repository is substitutable.
  it("is usable wherever a GraphRepository is expected", async () => {
    const repo: GraphRepository = new FakeGraphRepository();
    await repo.initializeSchema();
    expect((await repo.applyMigrations()).status).toBe("ok");

    await repo.replaceFileGraph(makeExtractedData("alpha"));
    await repo.replaceFileGraph(makeExtractedData("beta"));

    expect((await repo.getAllFiles()).map((f) => f.relativePath).sort()).toEqual([
      "src/alpha.ts",
      "src/beta.ts",
    ]);
    expect((await repo.getSymbolsForFile("src/alpha.ts")).map((s) => s.name)).toEqual(["alpha"]);

    const summary = await repo.getSessionSummary("/workspace");
    expect(summary).toMatchObject({ workspaceName: "workspace", fileCount: 2, symbolCount: 2 });
  });

  it("clears like the real adapter (workspace + by absolute path)", async () => {
    const repo: GraphRepository = new FakeGraphRepository();
    await repo.replaceFileGraph(makeExtractedData("alpha"));
    await repo.replaceFileGraph(makeExtractedData("beta"));

    expect(await repo.clearFile("/workspace/src/alpha.ts")).toMatchObject({ deletedFiles: 1 });
    expect((await repo.getAllFiles()).map((f) => f.relativePath)).toEqual(["src/beta.ts"]);

    expect(await repo.clearWorkspace("/workspace")).toMatchObject({ deletedFiles: 1 });
    expect(await repo.getAllFiles()).toHaveLength(0);
  });

  it("round-trips the workspace cache snapshot through validate", async () => {
    const repo: GraphRepository = new FakeGraphRepository();
    const identity = {
      cacheKey: "/workspace",
      workspaceRoot: "/workspace",
      repoRoot: null,
      repoRemote: null,
    };

    expect((await repo.validateWorkspaceCache(identity)).status).toBe("missing");
    await repo.writeWorkspaceCacheSnapshot({
      identity,
      schemaVersion: 1,
      indexedFileCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
    });
    expect((await repo.validateWorkspaceCache(identity)).status).toBe("ready");
  });
});
