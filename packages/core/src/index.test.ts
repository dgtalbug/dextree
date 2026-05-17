import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "./index.js";
import type { WorkspaceCacheIdentity } from "./types.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const wasmDir = resolve(packageRoot, "node_modules");
const fixturePath = resolve(packageRoot, "src/parser/__fixtures__/greet.ts");

const tempDirs: string[] = [];

function makeIdentity(workspaceRoot: string): WorkspaceCacheIdentity {
  return {
    cacheKey: workspaceRoot,
    workspaceRoot,
    repoRoot: null,
    repoRemote: null,
  };
}

describe("createIndexer", () => {
  it("indexes a TypeScript file and returns stored symbols", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-"));
    tempDirs.push(workspaceRoot);

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();

      const result = await indexer.indexFile(fixturePath, packageRoot);

      expect(result.relativePath).toBe("src/parser/__fixtures__/greet.ts");
      expect(result.symbolCount).toBe(2);
      expect(result.symbols.map((symbol) => symbol.name)).toEqual(["greet", "version"]);

      await expect(indexer.getSymbols("src/parser/__fixtures__/greet.ts")).resolves.toHaveLength(2);
    } finally {
      await indexer.dispose();
    }
  });

  it("reports missing cache before indexing and ready cache after a successful index", async () => {
    const indexer = createIndexer(":memory:", wasmDir);
    const identity = makeIdentity(packageRoot);

    try {
      await indexer.initialize();

      await expect(indexer.validateWorkspaceCache(identity)).resolves.toMatchObject({
        status: "missing",
      });

      await indexer.indexFile(fixturePath, packageRoot);

      await expect(indexer.validateWorkspaceCache(identity)).resolves.toMatchObject({
        status: "ready",
        metadata: expect.objectContaining({
          indexedFileCount: 1,
        }),
      });
    } finally {
      await indexer.dispose();
    }
  });
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    }),
  );
});
