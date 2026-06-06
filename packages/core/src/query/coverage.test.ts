import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIndexer } from "../index.js";
import type { Indexer } from "../types.js";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const wasmDir = resolve(packageRoot, "node_modules");

let indexer: Indexer | undefined;
afterEach(async () => {
  await indexer?.dispose();
  indexer = undefined;
});

describe("resolution tiers + coverage metric", () => {
  it("stamps every CALLS edge with a resolution tier and reports coverage", async () => {
    indexer = createIndexer(":memory:", wasmDir);
    await indexer.initialize();

    // Two files: a.ts defines helper + calls it; b.ts calls a same-file fn.
    const root = resolve(packageRoot, "src/query/__fixtures__/resolution");
    await indexer.indexFile(resolve(root, "a.ts"), root);
    await indexer.indexFile(resolve(root, "b.ts"), root);
    await indexer.finalizeWorkspace(root);

    const report = await indexer.getCoverageReport();

    // There is at least one CALLS edge and it carries a tier (not "unspecified").
    const callRows = report.rows.filter((r) => r.kind === "CALLS");
    expect(callRows.length).toBeGreaterThan(0);
    expect(callRows.every((r) => ["heuristic", "unresolved", "precise"].includes(r.tier))).toBe(
      true,
    );

    // Coverage ratio is a real number in [0,1].
    expect(report.resolvedRatio).toBeGreaterThanOrEqual(0);
    expect(report.resolvedRatio).toBeLessThanOrEqual(1);
    expect(report.totalEdges).toBeGreaterThan(0);
  });

  it("resolves a same-file call to a heuristic tier", async () => {
    indexer = createIndexer(":memory:", wasmDir);
    await indexer.initialize();
    const root = resolve(packageRoot, "src/query/__fixtures__/resolution");
    await indexer.indexFile(resolve(root, "a.ts"), root);
    await indexer.finalizeWorkspace(root);

    const report = await indexer.getCoverageReport();
    const heuristicCalls = report.rows.find((r) => r.kind === "CALLS" && r.tier === "heuristic");
    // a.ts calls helper() which is defined in a.ts → at least one heuristic-resolved CALLS.
    expect(heuristicCalls).toBeDefined();
    expect(heuristicCalls!.resolved).toBeGreaterThan(0);
  });
});
