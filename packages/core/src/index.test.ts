import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("persists entry-kind classification onto symbols during indexFile", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-api-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/index.ts");
    await writeFile(filePath, "export function createWidget() { return null }\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.indexFile(filePath, workspaceRoot);

      const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const symbolNode = subgraph.nodes.find(
        (n) => n.type === "symbol" && n.label === "createWidget",
      );

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.entryKind).toBe("public-api");
      expect(symbolNode?.archLayer).toBe("unknown");
    } finally {
      await indexer.dispose();
    }
  });

  it("classifies symbols in test files as entry-kind 'test' during indexFile", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-test-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/foo.test.ts");
    await writeFile(filePath, "export function describesFoo() {}\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.indexFile(filePath, workspaceRoot);

      const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const symbolNode = subgraph.nodes.find((n) => n.type === "symbol");

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.entryKind).toBe("test");
    } finally {
      await indexer.dispose();
    }
  });

  it("refreshes classification when the same file is reindexed with different content", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-refresh-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/main.ts");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();

      // First index: a non-entry helper -> unclassified.
      await writeFile(filePath, "export function helper() {}\n");
      await indexer.indexFile(filePath, workspaceRoot);
      let subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      let symbolNode = subgraph.nodes.find((n) => n.type === "symbol");
      expect(symbolNode?.label).toBe("helper");
      expect(symbolNode?.entryKind).toBe("unclassified");

      // Reindex: rename helper to main inside main.ts -> runtime.
      await writeFile(filePath, "export async function main() {}\n");
      await indexer.indexFile(filePath, workspaceRoot);
      subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      symbolNode = subgraph.nodes.find((n) => n.type === "symbol");
      expect(symbolNode?.label).toBe("main");
      expect(symbolNode?.entryKind).toBe("runtime");
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
