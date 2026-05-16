import { describe, expect, it } from "vitest";

import type { ExtractedIndexData } from "../types.js";
import { openDatabase } from "../storage/db.js";
import { replaceFileGraph } from "../storage/repository.js";
import { initializeSchema } from "../storage/schema.js";
import { getSymbolsForFile } from "./symbols.js";

function makeExtractedData(): ExtractedIndexData {
  return {
    file: {
      id: "file-query",
      path: "/workspace/src/query.ts",
      relativePath: "src/query.ts",
      language: "typescript",
      loc: 4,
      hash: "hash-query",
    },
    symbols: [
      {
        id: "symbol-a",
        fqn: "src/query.ts:alpha",
        name: "alpha",
        kind: "function",
        fileId: "file-query",
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 5 },
        language: "typescript",
      },
      {
        id: "symbol-b",
        fqn: "src/query.ts:beta",
        name: "beta",
        kind: "variable",
        fileId: "file-query",
        range: { startLine: 1, startCol: 0, endLine: 1, endCol: 4 },
        language: "typescript",
      },
    ],
  };
}

describe("getSymbolsForFile", () => {
  it("reads back stored symbols for a workspace-relative file path", async () => {
    const database = await openDatabase(":memory:");

    try {
      await initializeSchema(database.connection);
      await replaceFileGraph(database.connection, makeExtractedData());

      const symbols = await getSymbolsForFile(database.connection, "src/query.ts");

      expect(symbols).toHaveLength(2);
      expect(symbols.map((symbol) => symbol.name)).toEqual(["alpha", "beta"]);
      expect(symbols[0]?.range).toEqual({
        startLine: 0,
        startCol: 0,
        endLine: 0,
        endCol: 5,
      });
    } finally {
      database.close();
    }
  });
});
