import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock — reusable surface for QuickPick, save dialog, warning, info,
// fs.writeFile, fs.delete, activeTextEditor, workspaceFolders, configuration.
//
// Hoisted so the vi.mock("vscode", ...) factory can reference the spies
// (vi.mock is itself hoisted to the top of the module, ahead of any non-
// hoisted `const` declaration).
// ---------------------------------------------------------------------------

const {
  showQuickPick,
  showSaveDialog,
  showInformationMessage,
  showWarningMessage,
  showErrorMessage,
  writeFile,
  deleteFile,
  getActiveTextEditor,
  setActiveTextEditor,
  getWorkspaceFolders,
  setWorkspaceFolders,
} = vi.hoisted(() => {
  let activeTextEditor: { document: { uri: { fsPath: string } } } | undefined;
  let workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [
    { uri: { fsPath: "/workspace" } },
  ];

  return {
    showQuickPick: vi.fn(),
    showSaveDialog: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    getActiveTextEditor: () => activeTextEditor,
    setActiveTextEditor: (fsPath: string | undefined) => {
      activeTextEditor = fsPath === undefined ? undefined : { document: { uri: { fsPath } } };
    },
    getWorkspaceFolders: () => workspaceFolders,
    setWorkspaceFolders: (folders: Array<{ uri: { fsPath: string } }> | undefined) => {
      workspaceFolders = folders;
    },
  };
});

vi.mock("vscode", () => ({
  window: {
    get activeTextEditor() {
      return getActiveTextEditor();
    },
    showQuickPick,
    showSaveDialog,
    showInformationMessage,
    showWarningMessage,
    showErrorMessage,
  },
  workspace: {
    get workspaceFolders() {
      return getWorkspaceFolders();
    },
    fs: {
      writeFile,
      delete: deleteFile,
    },
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: string) => fallback),
    })),
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
    }),
    file: (path: string) => ({ fsPath: path }),
  },
}));

import { createExportMermaidCommand } from "./exportMermaid.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeIndexerStub(nodeCount: number) {
  return {
    getWorkspaceSubgraph: vi.fn(async () => ({
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: `node-${i}`,
        type: "file" as const,
        label: `src/file-${i}.ts`,
        filePath: `/workspace/src/file-${i}.ts`,
        startLine: 0,
      })),
      edges: [],
      frameworks: [],
    })),
  };
}

function resetMocks(): void {
  showQuickPick.mockReset();
  showSaveDialog.mockReset();
  showInformationMessage.mockReset();
  showWarningMessage.mockReset();
  showErrorMessage.mockReset();
  writeFile.mockReset();
  deleteFile.mockReset();
  setActiveTextEditor(undefined);
  setWorkspaceFolders([{ uri: { fsPath: "/workspace" } }]);
}

// ---------------------------------------------------------------------------
// Harness smoke tests. US1 (Scope), US2 (Granularity), and US3 (Direction +
// validator-failure UX) layer their own specs into this file as each story
// lands.
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — harness", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("returns a callable command function", () => {
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    expect(typeof command).toBe("function");
  });

  it("bails out with an info message when no workspace folder is open", async () => {
    setWorkspaceFolders(undefined);
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("open workspace"));
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("bails out with the index-first message when the workspace subgraph is empty", async () => {
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(0),
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Index your workspace first"),
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// US1 — Scope picker (Workspace / Current file)
// ---------------------------------------------------------------------------

function makeIndexerStubFromNodes(
  nodes: Array<{ id: string; type: "file" | "symbol"; label: string; filePath: string }>,
) {
  return {
    getWorkspaceSubgraph: vi.fn(async () => ({
      nodes: nodes.map((n) => ({ ...n, startLine: 0 })),
      edges: [],
      frameworks: [],
    })),
  };
}

describe("createExportMermaidCommand — US1 scope picker", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("offers Workspace + Current file when an active editor sits inside the workspace", async () => {
    setActiveTextEditor("/workspace/src/a.ts");
    showQuickPick.mockResolvedValueOnce(undefined); // cancel at scope step

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    const items = showQuickPick.mock.calls[0]?.[0] as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toEqual(["Workspace", "Current file"]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("offers Workspace only when no active editor matches the workspace root", async () => {
    setActiveTextEditor(undefined);
    showQuickPick.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    const items = showQuickPick.mock.calls[0]?.[0] as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toEqual(["Workspace"]);
  });

  it("exits silently when the user cancels at the scope step (no save dialog, no write)", async () => {
    showQuickPick.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("threads { kind: 'workspace' } through to the serializer and writes the file", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(2),
    });
    await command();

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Mermaid diagram saved to"),
    );
  });

  it("threads { kind: 'file', relativePath } when Current file is picked", async () => {
    setActiveTextEditor("/workspace/src/a.ts");
    showQuickPick
      .mockResolvedValueOnce({
        label: "Current file",
        scope: { kind: "file", relativePath: "src/a.ts" },
      })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
          { id: "n2", type: "symbol", label: "foo", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    expect(text).toContain("graph TB");
    expect(text).toContain("src/a.ts");
  });

  it("surfaces serializer errors via showWarningMessage and writes no file when the scope resolves to unsupported", async () => {
    setActiveTextEditor("/workspace/src/missing.ts");
    showQuickPick
      .mockResolvedValueOnce({
        label: "Current file",
        scope: { kind: "file", relativePath: "src/missing.ts" },
      })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("File not found in indexed graph"),
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// US2 — Granularity picker (Package / File / Symbol)
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — US2 granularity picker", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("offers Package / File / Symbol in that order after the scope step", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce(undefined); // cancel at granularity

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(2);
    const granularityItems = showQuickPick.mock.calls[1]?.[0] as Array<{ label: string }>;
    expect(granularityItems.map((i) => i.label)).toEqual(["Package", "File", "Symbol"]);
  });

  it("exits silently when the user cancels at the granularity step", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("threads granularity 'file' into the serializer when File is picked", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "File", granularity: "file" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "f1", type: "file", label: "a.ts", filePath: "/workspace/src/a.ts" },
          { id: "s1", type: "symbol", label: "foo", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    // File granularity collapses the symbol into the file → output has
    // only the file node and no `[function]` symbol-kind label.
    expect(text).not.toContain("[function]");
    expect(text).toContain('["a.ts"]');
  });

  it("threads granularity 'package' into the serializer when Package is picked", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Package", granularity: "package" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          {
            id: "f-a",
            type: "file",
            label: "a.ts",
            filePath: "/repo/packages/alpha/src/a.ts",
          },
          {
            id: "f-b",
            type: "file",
            label: "b.ts",
            filePath: "/repo/packages/beta/src/b.ts",
          },
        ]),
    });
    await command();

    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    // Package collapse → two synthetic nodes labelled alpha and beta.
    expect(text).toContain('["alpha"]');
    expect(text).toContain('["beta"]');
  });
});

// US2 will add: granularity picker (Package / File / Symbol), cancel-at-granularity.
//
// US3 will add: direction picker (Auto / TB / LR / BT / RL), validator-failure
// surfaces via showWarningMessage with no-write invariant.

export { setActiveTextEditor, setWorkspaceFolders };
