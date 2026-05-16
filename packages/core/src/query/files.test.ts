import { describe, expect, it } from "vitest";

import { openDatabase } from "../storage/db.js";
import { replaceFileGraph } from "../storage/repository.js";
import { initializeSchema } from "../storage/schema.js";
import { getAllFilesQuery } from "./files.js";

function makeFileData(name: string) {
  return {
    file: {
      id: `file-${name}`,
      path: `/workspace/src/${name}.ts`,
      relativePath: `src/${name}.ts`,
      language: "typescript",
      loc: 2,
      hash: `hash-${name}`,
    },
    symbols: [],
  };
}

describe("getAllFilesQuery", () => {
  it("returns empty array when no files have been indexed", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      const files = await getAllFilesQuery(db.connection);
      expect(files).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("returns one row after indexing one file", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      await replaceFileGraph(db.connection, makeFileData("alpha"));
      const files = await getAllFilesQuery(db.connection);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        relativePath: "src/alpha.ts",
        language: "typescript",
      });
      expect(typeof files[0]?.id).toBe("string");
    } finally {
      db.close();
    }
  });

  it("returns all rows ordered by relative path after indexing multiple files", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      await replaceFileGraph(db.connection, makeFileData("zebra"));
      await replaceFileGraph(db.connection, makeFileData("alpha"));
      const files = await getAllFilesQuery(db.connection);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.relativePath)).toEqual(["src/alpha.ts", "src/zebra.ts"]);
    } finally {
      db.close();
    }
  });

  it("returns a file node with no symbols (FR-007: files with zero symbols still appear)", async () => {
    const db = await openDatabase(":memory:");
    try {
      await initializeSchema(db.connection);
      await replaceFileGraph(db.connection, makeFileData("empty")); // symbols: []
      const files = await getAllFilesQuery(db.connection);
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("src/empty.ts");
    } finally {
      db.close();
    }
  });
});
