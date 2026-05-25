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

// US1 will add: scope picker (Workspace / Current file), cancel-at-scope behavior,
// relativePath resolution from activeTextEditor.
//
// US2 will add: granularity picker (Package / File / Symbol), cancel-at-granularity.
//
// US3 will add: direction picker (Auto / TB / LR / BT / RL), validator-failure
// surfaces via showWarningMessage with no-write invariant.

export { setActiveTextEditor, setWorkspaceFolders };
