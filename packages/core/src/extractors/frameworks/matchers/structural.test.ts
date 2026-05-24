import { describe, expect, it, vi } from "vitest";

import type { StructuralSignal } from "../types.js";
import { tryMatchStructural } from "./structural.js";

function fsFromMap(files: Record<string, string | null>, fileList?: readonly string[]) {
  return {
    readFile: async (relativePath: string) => files[relativePath] ?? null,
    listFiles: async (_glob: string) => fileList ?? Object.keys(files),
  };
}

describe("tryMatchStructural", () => {
  const reactSignal: StructuralSignal = {
    fileGlob: "**/*.tsx",
    contentPattern: 'from "react"',
  };

  it("returns true when a file contains the pattern", async () => {
    const io = fsFromMap({
      "src/App.tsx": 'import React from "react";\nexport default App;',
    });
    await expect(tryMatchStructural(reactSignal, io)).resolves.toBe(true);
  });

  it("returns false when no candidate file matches the content pattern", async () => {
    const io = fsFromMap({
      "src/App.tsx": "// no imports here",
    });
    await expect(tryMatchStructural(reactSignal, io)).resolves.toBe(false);
  });

  it("returns false when the glob yields no candidates", async () => {
    const io = fsFromMap({}, []);
    await expect(tryMatchStructural(reactSignal, io)).resolves.toBe(false);
  });

  it("respects maxFilesScanned cap", async () => {
    const files: Record<string, string> = {};
    const list: string[] = [];
    for (let i = 0; i < 100; i++) {
      const p = `src/empty${i}.tsx`;
      files[p] = "// nothing";
      list.push(p);
    }
    // Add the matching file at index 60 — beyond the cap of 50
    files["src/empty60.tsx"] = 'from "react"';

    const readFile = vi.fn(async (p: string) => files[p] ?? null);
    const io = {
      readFile,
      listFiles: async () => list,
    };

    const result = await tryMatchStructural({ ...reactSignal, maxFilesScanned: 50 }, io);
    expect(result).toBe(false);
    expect(readFile).toHaveBeenCalledTimes(50);
  });

  it("skips unreadable files instead of throwing", async () => {
    const io = {
      readFile: async (p: string) => {
        if (p === "src/Broken.tsx") throw new Error("EACCES");
        if (p === "src/Good.tsx") return 'from "react"';
        return null;
      },
      listFiles: async () => ["src/Broken.tsx", "src/Good.tsx"],
    };
    await expect(tryMatchStructural(reactSignal, io)).resolves.toBe(true);
  });

  it("returns false on invalid regex pattern", async () => {
    const io = fsFromMap({ "src/App.tsx": "anything" });
    await expect(
      tryMatchStructural({ fileGlob: "**/*.tsx", contentPattern: "[invalid(" }, io),
    ).resolves.toBe(false);
  });
});
