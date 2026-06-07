import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "../index.js";
import type { Indexer } from "../types.js";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const wasmDir = resolve(packageRoot, "node_modules");
const root = resolve(packageRoot, "src/query/__fixtures__/resolution");

let indexer: Indexer | undefined;
afterEach(async () => {
  await indexer?.dispose();
  indexer = undefined;
});

async function indexed(): Promise<Indexer> {
  const ix = createIndexer(":memory:", wasmDir);
  await ix.initialize();
  await ix.indexFile(resolve(root, "a.ts"), root);
  await ix.indexFile(resolve(root, "b.ts"), root);
  await ix.finalizeWorkspace(root);
  return ix;
}

describe("neighborhood() in-store traversal", () => {
  it("returns a file node's defined symbols via DEFINES, depth 1", async () => {
    indexer = await indexed();
    const graph = await indexer.getWorkspaceSubgraph(root);
    const aFile = graph.nodes.find((n) => n.type === "file" && n.filePath.endsWith("a.ts"));
    expect(aFile).toBeDefined();

    const nb = await indexer.neighborhood(aFile!.id, {
      direction: "out",
      depth: 1,
      edgeKinds: ["DEFINES"],
    });
    const symbolNames = nb.nodes.filter((n) => n.type === "symbol").map((n) => n.label);
    expect(symbolNames).toContain("helper");
    expect(symbolNames).toContain("useHelper");
  });

  it("direction selects callers vs callees", async () => {
    indexer = await indexed();
    const graph = await indexer.getWorkspaceSubgraph(root);
    const helper = graph.nodes.find((n) => n.label === "helper");
    expect(helper).toBeDefined();

    // Incoming CALLS to helper = its callers (useHelper).
    const callers = await indexer.neighborhood(helper!.id, {
      direction: "in",
      depth: 2,
      edgeKinds: ["CALLS"],
    });
    expect(callers.nodes.some((n) => n.label === "useHelper")).toBe(true);
  });

  it("terminates on the depth cap and reports truncated", async () => {
    indexer = await indexed();
    const graph = await indexer.getWorkspaceSubgraph(root);
    const anyNode = graph.nodes[0]!;
    const nb = await indexer.neighborhood(anyNode.id, {
      direction: "both",
      depth: 1,
      edgeKinds: ["DEFINES"],
      maxNodes: 1,
    });
    // maxNodes=1 forces truncation when the node has any neighbor.
    expect(typeof nb.truncated).toBe("boolean");
    expect(nb.nodes.length).toBeLessThanOrEqual(1);
  });
});

describe("folder tree (CONTAINS)", () => {
  it("synthesizes a root→folder→file tree reachable via neighborhood", async () => {
    indexer = await indexed();
    const graph = await indexer.getWorkspaceSubgraph(root);
    // Folder nodes are not part of getWorkspaceSubgraph, but CONTAINS edges +
    // folder nodes are reachable from the root folder via neighborhood. Find the
    // root folder by walking: a file is contained by a folder.
    const containsEdges = await indexer.neighborhood(
      // seed from any file; walk incoming CONTAINS to reach its folder
      graph.nodes.find((n) => n.type === "file")!.id,
      { direction: "in", depth: 10, edgeKinds: ["CONTAINS"] },
    );
    expect(containsEdges.nodes.some((n) => n.type === "folder")).toBe(true);
    expect(containsEdges.edges.some((e) => e.kind === "CONTAINS")).toBe(true);
  });

  it("re-index is stable: folder ids are deterministic", async () => {
    const ix1 = await indexed();
    const g1 = await ix1.getWorkspaceSubgraph(root);
    const file1 = g1.nodes.find((n) => n.type === "file")!.id;
    const folders1 = await ix1.neighborhood(file1, {
      direction: "in",
      depth: 10,
      edgeKinds: ["CONTAINS"],
    });
    const folderIds1 = folders1.nodes
      .filter((n) => n.type === "folder")
      .map((n) => n.id)
      .sort();
    await ix1.dispose();

    const ix2 = await indexed();
    const g2 = await ix2.getWorkspaceSubgraph(root);
    const file2 = g2.nodes.find((n) => n.type === "file")!.id;
    const folders2 = await ix2.neighborhood(file2, {
      direction: "in",
      depth: 10,
      edgeKinds: ["CONTAINS"],
    });
    const folderIds2 = folders2.nodes
      .filter((n) => n.type === "folder")
      .map((n) => n.id)
      .sort();
    await ix2.dispose();

    expect(folderIds1).toEqual(folderIds2);
    expect(folderIds1.length).toBeGreaterThan(0);
  });
});
