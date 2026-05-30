import { describe, expect, it } from "vitest";

import { openDatabase } from "../storage/db.js";
import { replaceFileGraph } from "../storage/repository.js";
import { initializeSchema } from "../storage/schema.js";
import type { EdgeRow } from "../extractors/types.js";
import type { ExtractedIndexData } from "../types.js";
import { getPresentEdgeKinds } from "./presentEdgeKinds.js";

const WORKSPACE = "/ws";

function makeFile(id: string, name: string): ExtractedIndexData {
  return {
    file: {
      id,
      path: `${WORKSPACE}/src/${name}.ts`,
      relativePath: `src/${name}.ts`,
      language: "typescript",
      loc: 4,
      hash: `hash-${id}`,
    },
    symbols: [
      {
        id: `sym-${id}-1`,
        fqn: `src/${name}.ts:alpha`,
        name: "alpha",
        kind: "function",
        fileId: id,
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 5 },
        language: "typescript",
      },
      {
        id: `sym-${id}-2`,
        fqn: `src/${name}.ts:beta`,
        name: "beta",
        kind: "function",
        fileId: id,
        range: { startLine: 2, startCol: 0, endLine: 2, endCol: 4 },
        language: "typescript",
      },
    ],
    imports: [],
  };
}

function makeCallsEdge(sourceId: string, targetId: string): EdgeRow {
  return {
    id: `edge-${sourceId}-${targetId}`,
    sourceId,
    targetId,
    kind: "CALLS",
    weight: null,
    metadata: { callee_name: "beta", call_site_range: "0:5-0:11", language: "typescript" },
  };
}

describe("getPresentEdgeKinds", () => {
  it("returns empty array for an empty workspace", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      expect(kinds).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("returns DEFINES after baseline indexing (symbols create DEFINES edges)", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const data = makeFile("f1", "alpha");
      await replaceFileGraph(db.connection, data);

      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      expect(kinds).toContain("DEFINES");
    } finally {
      db.close();
    }
  });

  it("includes CALLS when CALLS edges are inserted", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const data = makeFile("f2", "caller");
      const callsEdge = makeCallsEdge("sym-f2-1", "sym-f2-2");
      await replaceFileGraph(db.connection, data, [callsEdge]);

      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      expect(kinds).toContain("CALLS");
    } finally {
      db.close();
    }
  });

  it("includes CUSTOM_FOO when a custom edge kind is inserted", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const data = makeFile("f3", "custom");
      const customEdge: EdgeRow = {
        id: "edge-custom-1",
        sourceId: "sym-f3-1",
        targetId: "sym-f3-2",
        kind: "CUSTOM_FOO",
        weight: null,
        metadata: {},
      };
      await replaceFileGraph(db.connection, data, [customEdge]);

      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      expect(kinds).toContain("CUSTOM_FOO");
    } finally {
      db.close();
    }
  });

  // Slice 031 T007 — IMPLEMENTS edge kind must surface through the same
  // distinct-kinds query without any code change (generic SELECT DISTINCT kind).
  it("includes IMPLEMENTS when an IMPLEMENTS edge is inserted (slice 031 T007)", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const data = makeFile("f-impl", "shapes");
      const implementsEdge: EdgeRow = {
        id: "edge-impl-1",
        sourceId: "sym-f-impl-1",
        targetId: "sym-f-impl-2",
        kind: "IMPLEMENTS",
        weight: null,
        metadata: {
          source_fqn: "src/shapes.ts:Circle",
          interface_name: "Shape",
          language: "typescript",
        },
      };
      await replaceFileGraph(db.connection, data, [implementsEdge]);

      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      expect(kinds).toContain("IMPLEMENTS");
    } finally {
      db.close();
    }
  });

  it("returns results sorted alphabetically", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const data = makeFile("f4", "sorted");
      const callsEdge = makeCallsEdge("sym-f4-1", "sym-f4-2");
      const customEdge: EdgeRow = {
        id: "edge-custom-2",
        sourceId: "sym-f4-1",
        targetId: "sym-f4-2",
        kind: "CALLS",
        weight: null,
        metadata: {},
      };
      await replaceFileGraph(db.connection, data, [callsEdge, customEdge]);

      const kinds = await getPresentEdgeKinds(db.connection, WORKSPACE);
      const sorted = [...kinds].sort();
      expect(kinds).toEqual(sorted);
    } finally {
      db.close();
    }
  });
});
