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

  it("classifies symbols in presentation paths as archLayer 'presentation' during indexFile", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-layer-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src/components"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/components/Card.tsx");
    await writeFile(filePath, "export function renderCard() {}\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.indexFile(filePath, workspaceRoot);

      const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const symbolNode = subgraph.nodes.find(
        (n) => n.type === "symbol" && n.label === "renderCard",
      );

      expect(symbolNode).toBeDefined();
      expect(symbolNode?.archLayer).toBe("presentation");
    } finally {
      await indexer.dispose();
    }
  });

  it("classifies symbols without calling detectWorkspaceFrameworks (US3 pass-1-only)", async () => {
    // The slice contract says classification must work whenever pass-1
    // indexing runs, even if no framework detection / enrichment pass has
    // been invoked. We exercise that by indexing a file in a fresh indexer
    // without ever calling detectWorkspaceFrameworks().
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-pass1-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src/components"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/components/Card.tsx");
    await writeFile(filePath, "export function Card() {}\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.indexFile(filePath, workspaceRoot);

      const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const symbolNode = subgraph.nodes.find((n) => n.type === "symbol");

      expect(symbolNode).toBeDefined();
      // Classification fired despite framework cache being empty.
      expect(symbolNode?.archLayer).toBe("presentation");
      expect(symbolNode?.entryKind).toBeDefined();
    } finally {
      await indexer.dispose();
    }
  });

  it("indexes mixed-classification workspaces fully (US3 graceful degradation)", async () => {
    // Mix of a clearly-classified file and a structurally-unclassifiable
    // helper. The unclassifiable file must remain visible with neutral
    // (unclassified/unknown) classification instead of being dropped.
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-mixed-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true });

    const helperPath = resolve(workspaceRoot, "src/helper.ts");
    await writeFile(helperPath, "function helper() {}\n");

    const entryPath = resolve(workspaceRoot, "src/main.ts");
    await writeFile(entryPath, "export async function main() {}\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.indexFile(helperPath, workspaceRoot);
      await indexer.indexFile(entryPath, workspaceRoot);

      const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const symbolNodes = subgraph.nodes.filter((n) => n.type === "symbol");

      // Both symbols are present despite one being unclassified.
      const byLabel = new Map(symbolNodes.map((n) => [n.label, n]));
      expect(byLabel.get("helper")?.entryKind).toBe("unclassified");
      expect(byLabel.get("helper")?.archLayer).toBe("unknown");
      expect(byLabel.get("main")?.entryKind).toBe("runtime");
    } finally {
      await indexer.dispose();
    }
  });

  it("supports the full indexer lifecycle: detect, index, finalize, query, clear", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-core-026-lifecycle-"));
    tempDirs.push(workspaceRoot);
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true });
    const filePath = resolve(workspaceRoot, "src/lifecycle.ts");
    await writeFile(filePath, "export function lifecycle() {}\n");

    const indexer = createIndexer(":memory:", wasmDir);

    try {
      await indexer.initialize();
      await indexer.detectWorkspaceFrameworks(workspaceRoot);
      await indexer.indexFile(filePath, workspaceRoot);
      await indexer.finalizeWorkspace(workspaceRoot);

      const files = await indexer.getAllFiles();
      expect(files.map((f) => f.relativePath)).toContain("src/lifecycle.ts");

      const edgeKinds = await indexer.getPresentEdgeKinds(workspaceRoot);
      expect(edgeKinds).toContain("DEFINES");

      const summary = await indexer.getSessionSummary(workspaceRoot);
      expect(summary.fileCount).toBe(1);
      expect(summary.symbolCount).toBe(1);

      const cleared = await indexer.clearWorkspace(workspaceRoot);
      expect(cleared.deletedFiles).toBe(1);

      const afterClear = await indexer.getAllFiles();
      expect(afterClear).toEqual([]);
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
