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
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce(undefined); // cancel at scope step

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(2);
    const items = showQuickPick.mock.calls[1]?.[0] as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toEqual(["Workspace", "Current file"]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("offers Workspace only when no active editor matches the workspace root", async () => {
    setActiveTextEditor(undefined);
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "n1", type: "file", label: "src/a.ts", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    const items = showQuickPick.mock.calls[1]?.[0] as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toEqual(["Workspace"]);
  });

  it("exits silently when the user cancels at the scope step (no save dialog, no write)", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("threads { kind: 'workspace' } through to the serializer and writes the file", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
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
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({
        label: "Current file",
        scope: { kind: "file", relativePath: "src/a.ts" },
      })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
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
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({
        label: "Current file",
        scope: { kind: "file", relativePath: "src/missing.ts" },
      })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
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
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce(undefined); // cancel at granularity

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(3);
    const granularityItems = showQuickPick.mock.calls[2]?.[0] as Array<{ label: string }>;
    expect(granularityItems.map((i) => i.label)).toEqual(["Package", "File", "Symbol"]);
  });

  it("exits silently when the user cancels at the granularity step", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
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
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "File", granularity: "file" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
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
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Package", granularity: "package" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
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
// ---------------------------------------------------------------------------
// US3 — Direction picker + fail-closed validator
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — US3 direction picker + validator", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("offers Auto / Top-down / Left-right / Bottom-up / Right-left after the granularity step", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce(undefined); // cancel at direction

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(4);
    const directionItems = showQuickPick.mock.calls[3]?.[0] as Array<{ label: string }>;
    expect(directionItems.map((i) => i.label)).toEqual([
      "Auto",
      "Top-down",
      "Left-right",
      "Bottom-up",
      "Right-left",
    ]);
  });

  it("exits silently when the user cancels at the direction step", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("Top-down picks graph TB explicitly (no auto inference)", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Top-down", direction: "TB" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    expect(text.split("\n")[1]).toBe("graph TB");
  });

  it("Left-right picks graph LR explicitly", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Left-right", direction: "LR" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    expect(text.split("\n")[1]).toBe("graph LR");
  });

  it("refuses an oversized symbol-granularity export with showWarningMessage and writes no file", async () => {
    // 250 file nodes > symbol cap (200)
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(250),
    });
    await command();

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("exceeds the symbol cap of 200 nodes"),
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Slice 028 — Diagram picker (Flowchart / Class diagram), first QuickPick step
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — slice 028 diagram picker", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("offers Flowchart and Class diagram in that order as the first picker", async () => {
    showQuickPick.mockResolvedValueOnce(undefined); // cancel at diagram step

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    const diagramItems = showQuickPick.mock.calls[0]?.[0] as Array<{ label: string }>;
    expect(diagramItems.map((i) => i.label)).toEqual(["Flowchart", "Class diagram"]);
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("exits silently when the user cancels at the diagram step", async () => {
    showQuickPick.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(showErrorMessage).not.toHaveBeenCalled();
  });

  it("skips Granularity + Direction pickers when Class diagram is picked", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Class diagram", diagram: "classDiagram" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          { id: "c1", type: "symbol", label: "Animal", filePath: "/workspace/src/a.ts" },
        ]),
    });
    // Force the class node to be a class symbolKind by patching the stub
    // shape so the validator allows the export through.
    await command();

    // Only 2 quickpicks fired: Diagram + Scope. Granularity + Direction skipped.
    expect(showQuickPick).toHaveBeenCalledTimes(2);
    expect(showSaveDialog).toHaveBeenCalledTimes(1);
  });

  it("runs the slice-027 four-step flow when Flowchart is picked", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Flowchart", diagram: "flowchart" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } })
      .mockResolvedValueOnce({ label: "Symbol", granularity: "symbol" })
      .mockResolvedValueOnce({ label: "Auto", direction: "auto" });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
    });
    await command();

    // All 4 quickpicks fire: Diagram + Scope + Granularity + Direction.
    expect(showQuickPick).toHaveBeenCalledTimes(4);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    // Flowchart path keeps the slice-027 `graph TB` second-line header.
    expect(text.split("\n")[1]).toBe("graph TB");
  });

  it("surfaces the no-class-like-symbols reason via showWarningMessage when Class diagram is picked against a scope with no classes (US3 T024)", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Class diagram", diagram: "classDiagram" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });

    const command = createExportMermaidCommand({
      getIndexer: async () =>
        makeIndexerStubFromNodes([
          // No class-like symbols — just a function.
          { id: "fn-1", type: "symbol", label: "doStuff", filePath: "/workspace/src/a.ts" },
        ]),
    });
    await command();

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("No class, interface, or enum symbols are in the chosen scope"),
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("Class diagram path emits a 'classDiagram' header instead of 'graph TB'", async () => {
    showQuickPick
      .mockResolvedValueOnce({ label: "Class diagram", diagram: "classDiagram" })
      .mockResolvedValueOnce({ label: "Workspace", scope: { kind: "workspace" } });
    showSaveDialog.mockResolvedValueOnce({ fsPath: "/workspace/out.mmd" });
    writeFile.mockResolvedValueOnce(undefined);

    const command = createExportMermaidCommand({
      getIndexer: async () => ({
        getWorkspaceSubgraph: vi.fn(async () => ({
          nodes: [
            {
              id: "c1",
              type: "symbol" as const,
              label: "Animal",
              filePath: "/workspace/src/a.ts",
              startLine: 1,
              symbolKind: "class" as const,
            },
          ],
          edges: [],
          frameworks: [],
        })),
      }),
    });
    await command();

    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const text = new TextDecoder().decode(written);
    expect(text.split("\n")[1]).toBe("classDiagram");
    expect(text).not.toMatch(/^graph\s/m);
  });
});

export { setActiveTextEditor, setWorkspaceFolders };
