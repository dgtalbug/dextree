import { describe, expect, it } from "vitest";

import { detectFrameworks } from "./detector.js";

interface MockWorkspace {
  files: Record<string, string>;
}

function ioFor(ws: MockWorkspace) {
  return {
    workspaceRoot: "/mock",
    readFile: async (rel: string) => ws.files[rel] ?? null,
    listFiles: async (glob: string) => {
      // Tiny glob translator covering the patterns used by the registry —
      // good enough for unit tests. Real listFiles wraps a glob library.
      return Object.keys(ws.files).filter((p) => matchGlob(p, glob));
    },
  };
}

function matchGlob(path: string, glob: string): boolean {
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      pattern += ".*";
      i += 2;
      if (glob[i] === "/") i++;
    } else if (ch === "*") {
      pattern += "[^/]*";
      i++;
    } else if (ch === "{") {
      const end = glob.indexOf("}", i);
      const alts = glob
        .slice(i + 1, end)
        .split(",")
        .map(escape)
        .join("|");
      pattern += `(${alts})`;
      i = end + 1;
    } else {
      pattern += escape(ch ?? "");
      i++;
    }
  }
  return new RegExp(`^${pattern}$`).test(path);
}

describe("detectFrameworks", () => {
  it("detects react when both manifest and structural fire", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
        "src/App.tsx": 'import React from "react";\nexport default () => <div />;',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).toContain("react");
  });

  it("detects vscode-extension via engines.vscode + structural import", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({ engines: { vscode: "^1.85.0" } }),
        "src/extension.ts": 'import * as vscode from "vscode";',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).toContain("vscode-extension");
  });

  it("detects vitest via devDependencies", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({ devDependencies: { vitest: "^3.0.0" } }),
        "src/a.test.ts": 'import { describe, it } from "vitest"; describe("x", () => {});',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).toContain("vitest");
  });

  it("does NOT detect when only manifest fires (no structural)", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).not.toContain("react");
  });

  it("does NOT detect when only structural fires (no manifest)", async () => {
    const ws = {
      files: {
        "src/App.tsx": 'import React from "react";',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).not.toContain("react");
  });

  it("returns an empty array on a plain Markdown repo", async () => {
    const ws = { files: { "README.md": "# Hi" } };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected).toEqual([]);
  });

  it("is deterministic — two runs over the same input yield identical output", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({
          dependencies: { react: "^19.0.0" },
          devDependencies: { vitest: "^3.0.0" },
        }),
        "src/App.tsx": 'import React from "react";',
        "src/a.test.ts": 'import { describe } from "vitest"; describe("x", () => {});',
      },
    };
    const first = await detectFrameworks(ioFor(ws));
    const second = await detectFrameworks(ioFor(ws));
    expect(first).toEqual(second);
  });

  it("isolates listFiles failures — a thrown listFiles does not stop other frameworks", async () => {
    // listFiles is the unguarded surface — the matchers catch read failures
    // silently, but a malformed glob in one framework should not poison the
    // whole detection pass.
    const ws = {
      files: {
        "package.json": JSON.stringify({
          dependencies: { react: "^19.0.0" },
          devDependencies: { vitest: "^3.0.0" },
        }),
        "src/App.tsx": 'import React from "react";',
        "src/a.test.ts": 'import { describe } from "vitest"; describe("x", () => {});',
      },
    };
    const base = ioFor(ws);
    let firstListFiles = true;
    const io = {
      ...base,
      listFiles: async (glob: string) => {
        if (firstListFiles) {
          firstListFiles = false;
          throw new Error("synthetic listFiles failure");
        }
        return base.listFiles(glob);
      },
    };
    const detected = await detectFrameworks(io);
    // React's first listFiles throws, but other frameworks still run and detect.
    expect(detected.map((d) => d.frameworkName)).toContain("vitest");
  });

  it("detects pytest via requirements.txt regex", async () => {
    const ws = {
      files: {
        "requirements.txt": "pytest==7.4.0\nrequests==2.31.0\n",
        "tests/test_app.py": "import pytest\ndef test_x():\n    pass\n",
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).toContain("pytest");
  });

  it("detects gin via go.mod + go source", async () => {
    const ws = {
      files: {
        "go.mod": "module example\n\nrequire github.com/gin-gonic/gin v1.9.1\n",
        "main.go": 'import "github.com/gin-gonic/gin"\nfunc main() { r := gin.Default() }\n',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    expect(detected.map((d) => d.frameworkName)).toContain("gin");
  });

  it("all detections carry detectionSource 'manifest+structural' and confidence 1.0", async () => {
    const ws = {
      files: {
        "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
        "src/App.tsx": 'import React from "react";',
      },
    };
    const detected = await detectFrameworks(ioFor(ws));
    for (const row of detected) {
      expect(row.detectionSource).toBe("manifest+structural");
      expect(row.confidence).toBe(1.0);
    }
  });
});
