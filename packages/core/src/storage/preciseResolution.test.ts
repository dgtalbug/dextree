import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { openDatabase } from "./db.js";
import { replaceFileGraph } from "./repository.js";
import { resolveWorkspaceCrossFileEdges, stampResolutionTier } from "./resolution.js";
import {
  findSymbolIdAt,
  getUnresolvedCallSites,
  persistPreciseEdges,
} from "./preciseResolution.js";
import { initializeSchema } from "./schema.js";

const WS = "/workspace";

/** Two files: `caller` calls `target` by name (cross-file → heuristic after resolve). */
function callerFile(): ExtractedIndexData {
  return {
    file: {
      id: "f-caller",
      path: `${WS}/src/caller.ts`,
      relativePath: "src/caller.ts",
      language: "typescript",
      loc: 5,
      hash: "h-caller",
    },
    symbols: [
      {
        id: "s-caller",
        fqn: "src/caller.ts:caller",
        name: "caller",
        kind: "function",
        fileId: "f-caller",
        range: { startLine: 2, startCol: 0, endLine: 4, endCol: 1 },
        language: "typescript",
      },
    ],
    imports: [],
  };
}

function targetFile(): ExtractedIndexData {
  return {
    file: {
      id: "f-target",
      path: `${WS}/src/target.ts`,
      relativePath: "src/target.ts",
      language: "typescript",
      loc: 5,
      hash: "h-target",
    },
    symbols: [
      {
        id: "s-target",
        fqn: "src/target.ts:doThing",
        name: "doThing",
        kind: "function",
        fileId: "f-target",
        range: { startLine: 10, startCol: 0, endLine: 12, endCol: 1 },
        language: "typescript",
      },
    ],
    imports: [],
  };
}

/** Seed a CALLS edge from s-caller naming doThing, unresolved target. */
async function seedCallEdge(connection: Awaited<ReturnType<typeof openDatabase>>["connection"]) {
  await connection.run(
    `INSERT INTO edge (id, source_id, target_id, kind, metadata)
     VALUES ('e-call', 's-caller', NULL, 'CALLS', '{"calleeName":"doThing"}')`,
  );
}

async function fresh() {
  const db = await openDatabase(":memory:");
  await initializeSchema(db.connection);
  await replaceFileGraph(db.connection, callerFile());
  await replaceFileGraph(db.connection, targetFile());
  await seedCallEdge(db.connection);
  return db;
}

async function edgeRow(connection: Awaited<ReturnType<typeof openDatabase>>["connection"]) {
  const rows = await (
    await connection.run(
      `SELECT target_id, json_extract_string(metadata, '$.resolution') AS res FROM edge WHERE id = 'e-call'`,
    )
  ).getRowObjectsJS();
  return rows[0] as { target_id: string | null; res: string | null };
}

describe("preciseResolution (real DuckDB)", () => {
  it("lists the unresolved CALLS site with its source location", async () => {
    const db = await fresh();
    try {
      const sites = await getUnresolvedCallSites(db.connection, WS);
      expect(sites).toHaveLength(1);
      expect(sites[0]).toEqual({
        edgeId: "e-call",
        sourceLocation: { filePath: `${WS}/src/caller.ts`, line: 2, column: 0 },
      });
    } finally {
      db.close();
    }
  });

  it("findSymbolIdAt maps a file+line to the target symbol id", async () => {
    const db = await fresh();
    try {
      expect(await findSymbolIdAt(db.connection, `${WS}/src/target.ts`, 10)).toBe("s-target");
      expect(await findSymbolIdAt(db.connection, `${WS}/src/target.ts`, 999)).toBeNull();
    } finally {
      db.close();
    }
  });

  it("persistPreciseEdges sets target_id + precise tier", async () => {
    const db = await fresh();
    try {
      const n = await persistPreciseEdges(db.connection, [
        { edgeId: "e-call", targetId: "s-target" },
      ]);
      expect(n).toBe(1);
      expect(await edgeRow(db.connection)).toEqual({ target_id: "s-target", res: "precise" });
    } finally {
      db.close();
    }
  });

  it("precise edge is not downgraded by a later stampResolutionTier, and drops out of the work-list", async () => {
    const db = await fresh();
    try {
      await persistPreciseEdges(db.connection, [{ edgeId: "e-call", targetId: "s-target" }]);
      // A later heuristic re-stamp must NOT downgrade it.
      await stampResolutionTier(db.connection);
      expect(await edgeRow(db.connection)).toEqual({ target_id: "s-target", res: "precise" });
      // And it is no longer offered as an unresolved site.
      expect(await getUnresolvedCallSites(db.connection, WS)).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("a heuristic edge (resolved by name) is still offered for precise upgrade", async () => {
    const db = await fresh();
    try {
      await resolveWorkspaceCrossFileEdges(db.connection, WS); // sets target + heuristic tier
      const sites = await getUnresolvedCallSites(db.connection, WS);
      expect(sites.map((s) => s.edgeId)).toContain("e-call");
    } finally {
      db.close();
    }
  });
});
