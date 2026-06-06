import { beforeEach, describe, expect, it, vi } from "vitest";

const createIndexer = vi.fn();
const createWorkspaceWatcher = vi.fn(() => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
}));
const createOutputChannel = vi.fn(() => ({
  appendLine: vi.fn(),
  dispose: vi.fn(),
}));
const registerCommand = vi.fn((_command, handler) => ({
  dispose: vi.fn(),
  handler,
}));
const createTreeView = vi.fn(() => ({
  dispose: vi.fn(),
  onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
}));
const createDirectory = vi.fn();
const findFiles = vi.fn();
const getWorkspaceFolder = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();
const showWarningMessage = vi.fn();
const createPanel = vi.fn();
const pushGraph = vi.fn();
const pushIndexing = vi.fn();
const isPanelOpen = vi.fn(() => false);
const resolveCacheIdentity = vi.fn();
const withProgress = vi.fn(async (_options, task) =>
  task(
    {
      report: vi.fn(),
    },
    {
      isCancellationRequested: false,
    },
  ),
);

const mockState = {
  activeTextEditor: null as null | {
    document: {
      languageId: string;
      uri: { fsPath: string };
    };
  },
};

const createWorkspaceIgnore = vi.fn(async () => ({
  ignores: () => false,
}));

vi.mock("@dextree/core", () => ({
  createIndexer,
  createWorkspaceIgnore,
}));

const setWorkspaceHandlers = vi.fn();
const setLogger = vi.fn();
const setMermaidPreviewHandler = vi.fn();
const pushMermaidPreview = vi.fn();

vi.mock("./webview/panel.js", () => ({
  WebviewPanelManager: {
    create: createPanel,
    isOpen: isPanelOpen,
    pushGraph,
    pushIndexing,
    pushMermaidPreview,
    setWorkspaceHandlers,
    setLogger,
    setMermaidPreviewHandler,
  },
}));

vi.mock("./cache/resolveCacheIdentity.js", () => ({
  resolveCacheIdentity,
}));

vi.mock("./watcher/workspaceWatcher.js", () => ({
  createWorkspaceWatcher,
}));

vi.mock("vscode", () => ({
  window: {
    createOutputChannel,
    createTreeView,
    withProgress,
    get activeTextEditor() {
      return mockState.activeTextEditor;
    },
    showInformationMessage,
    showErrorMessage,
    showWarningMessage,
  },
  commands: {
    registerCommand,
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  EventEmitter: class MockEventEmitter {
    fire = vi.fn();
    event = vi.fn();
    dispose = vi.fn();
  },
  workspace: {
    get workspaceFolders() {
      return [{ uri: { fsPath: "/workspace" } }];
    },
    fs: {
      createDirectory,
    },
    findFiles,
    getWorkspaceFolder,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

describe("activate", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.activeTextEditor = null;
    createOutputChannel.mockClear();
    registerCommand.mockClear();
    createIndexer.mockReset();
    createDirectory.mockReset();
    findFiles.mockReset();
    getWorkspaceFolder.mockReset();
    showInformationMessage.mockReset();
    showErrorMessage.mockReset();
    showWarningMessage.mockReset();
    createPanel.mockReset();
    pushGraph.mockReset();
    pushIndexing.mockReset();
    isPanelOpen.mockReset();
    resolveCacheIdentity.mockReset();
    createTreeView.mockClear();
    withProgress.mockClear();
    setMermaidPreviewHandler.mockReset();
    pushMermaidPreview.mockReset();
    isPanelOpen.mockReturnValue(false);
    resolveCacheIdentity.mockResolvedValue({
      cacheKey: "/workspace",
      workspaceRoot: "/workspace",
      repoRoot: null,
      repoRemote: null,
    });
  });

  it("registers the index file command and output channel", async () => {
    createIndexer.mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn(),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "missing",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: null,
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn(),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    });

    const extension = await import("./extension.js");
    const subscriptions: { dispose(): void }[] = [];

    await extension.activate({
      subscriptions,
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    expect(createOutputChannel).toHaveBeenCalledWith("Dextree");
    expect(registerCommand).toHaveBeenCalledWith("dextree.indexFile", expect.any(Function));
    expect(subscriptions.length).toBeGreaterThan(0);
  });

  it("pushes a refreshed graph after indexing succeeds while the panel is open", async () => {
    const mockIndexer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn().mockResolvedValue({
        relativePath: "src/greet.ts",
        symbolCount: 1,
        elapsedMs: 5,
        symbols: [
          {
            id: "symbol-1",
            fqn: "src/greet.ts:greet",
            name: "greet",
            kind: "function",
            fileId: "file-1",
            range: { startLine: 0, startCol: 0, endLine: 0, endCol: 5 },
            language: "typescript",
          },
        ],
      }),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "ready",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: {
          schemaVersion: 1,
          lastSuccessfulIndexAt: new Date().toISOString(),
          indexedFileCount: 1,
          graphNodeCount: 1,
          graphEdgeCount: 0,
        },
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn(),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: "file-1",
            type: "file",
            label: "/workspace/src/greet.ts",
            filePath: "/workspace/src/greet.ts",
            startLine: 1,
          },
        ],
        edges: [],
        frameworks: [],
      }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue(["DEFINES"]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    };

    createIndexer.mockReturnValue(mockIndexer);
    isPanelOpen.mockReturnValue(true);
    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/greet.ts" },
      },
    };
    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });

    const extension = await import("./extension.js");
    const subscriptions: { dispose(): void }[] = [];

    await extension.activate({
      subscriptions,
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    const indexFileHandler = registerCommand.mock.calls.find(
      (call) => call[0] === "dextree.indexFile",
    )?.[1];

    await indexFileHandler?.();

    await vi.waitFor(() => {
      expect(mockIndexer.getWorkspaceSubgraph).toHaveBeenCalledWith("/workspace");
      expect(pushGraph).toHaveBeenCalledWith({
        nodes: [
          {
            id: "file-1",
            type: "file",
            label: "/workspace/src/greet.ts",
            filePath: "/workspace/src/greet.ts",
            startLine: 1,
          },
        ],
        edges: [],
        frameworks: [],
        presentEdgeKinds: ["DEFINES"],
        workspaceName: "workspace",
        workspaceFrameworks: [],
      });
    });
  });

  it("pushes a refreshed graph after workspace indexing succeeds while the panel is open", async () => {
    const mockIndexer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn().mockResolvedValue({
        relativePath: "src/greet.ts",
        symbolCount: 1,
        elapsedMs: 5,
        symbols: [],
      }),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "ready",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: {
          schemaVersion: 1,
          lastSuccessfulIndexAt: new Date().toISOString(),
          indexedFileCount: 1,
          graphNodeCount: 1,
          graphEdgeCount: 0,
        },
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn(),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: "file-1",
            type: "file",
            label: "/workspace/src/greet.ts",
            filePath: "/workspace/src/greet.ts",
            startLine: 1,
          },
        ],
        edges: [],
        frameworks: [],
      }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue(["DEFINES"]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      clearWorkspace: vi
        .fn()
        .mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 }),
      clearAll: vi.fn().mockResolvedValue({ clearedTables: 0 }),
      finalizeWorkspace: vi.fn().mockResolvedValue(undefined),
      detectWorkspaceFrameworks: vi.fn().mockResolvedValue([]),
      getSessionSummary: vi.fn().mockResolvedValue({}),
      dispose: vi.fn(),
    };

    createIndexer.mockReturnValue(mockIndexer);
    isPanelOpen.mockReturnValue(true);
    findFiles.mockResolvedValue([{ fsPath: "/workspace/src/greet.ts" }]);

    const extension = await import("./extension.js");
    const subscriptions: { dispose(): void }[] = [];

    await extension.activate({
      subscriptions,
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    const indexWorkspaceHandler = registerCommand.mock.calls.find(
      (call) => call[0] === "dextree.indexWorkspace",
    )?.[1];

    await indexWorkspaceHandler?.();

    await vi.waitFor(() => {
      expect(createPanel).toHaveBeenCalled();
      expect(pushIndexing).toHaveBeenCalledWith({
        phase: "starting",
        current: 0,
        total: 1,
        fileName: null,
        failed: 0,
        cancelled: false,
        status: "starting",
      });
      expect(mockIndexer.indexFile).toHaveBeenCalledWith("/workspace/src/greet.ts", "/workspace", {
        cacheKey: "/workspace",
        workspaceRoot: "/workspace",
        repoRoot: null,
        repoRemote: null,
      });
      expect(mockIndexer.getWorkspaceSubgraph).toHaveBeenCalledWith("/workspace");
      expect(pushGraph).toHaveBeenCalledWith({
        nodes: [
          {
            id: "file-1",
            type: "file",
            label: "/workspace/src/greet.ts",
            filePath: "/workspace/src/greet.ts",
            startLine: 1,
          },
        ],
        edges: [],
        frameworks: [],
        presentEdgeKinds: ["DEFINES"],
        workspaceName: "workspace",
        workspaceFrameworks: [],
      });
      expect(pushIndexing).toHaveBeenCalledWith({
        phase: "finished",
        current: 1,
        total: 1,
        fileName: "greet.ts",
        failed: 0,
        cancelled: false,
        status: "completed",
      });
    });
  });

  it("bootstraps workspace cache validation on activation", async () => {
    const mockIndexer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn(),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "ready",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: {
          schemaVersion: 1,
          lastSuccessfulIndexAt: new Date().toISOString(),
          indexedFileCount: 1,
          graphNodeCount: 1,
          graphEdgeCount: 0,
        },
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi
        .fn()
        .mockResolvedValue([
          { id: "file-1", relativePath: "src/greet.ts", language: "typescript" },
        ]),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    };

    createIndexer.mockReturnValue(mockIndexer);

    const extension = await import("./extension.js");

    await extension.activate({
      subscriptions: [],
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    await vi.waitFor(() => {
      expect(resolveCacheIdentity).toHaveBeenCalledWith({ workspaceRoot: "/workspace" });
      expect(mockIndexer.validateWorkspaceCache).toHaveBeenCalledWith({
        cacheKey: "/workspace",
        workspaceRoot: "/workspace",
        repoRoot: null,
        repoRemote: null,
      });
    });
  });

  it("shows a non-blocking warning when the persisted cache is unreadable", async () => {
    const mockIndexer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn(),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "invalid",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: null,
        reason: "unreadable",
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn().mockResolvedValue([]),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    };

    createIndexer.mockReturnValue(mockIndexer);

    const extension = await import("./extension.js");

    await extension.activate({
      subscriptions: [],
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    await vi.waitFor(() => {
      expect(showWarningMessage).toHaveBeenCalledWith(
        "Dextree: Persisted cache could not be read. Showing fallback state.",
      );
    });
  });

  it("does not propagate SchemaError from initialize during activation", async () => {
    class FakeSchemaError extends Error {
      constructor(reason: string) {
        super(`Dextree schema migration failed: ${reason}`);
        this.name = "SchemaError";
      }
    }

    const mockIndexer = {
      initialize: vi
        .fn()
        .mockRejectedValue(
          new FakeSchemaError("persisted schema version 99 is newer than supported"),
        ),
      indexFile: vi.fn(),
      validateWorkspaceCache: vi.fn(),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn().mockResolvedValue([]),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    };

    createIndexer.mockReturnValue(mockIndexer);

    const extension = await import("./extension.js");

    // Activation must NOT throw even when initialize rejects.
    await expect(
      extension.activate({
        subscriptions: [],
        storageUri: { fsPath: "/workspace/.storage" },
        extensionUri: { fsPath: "/workspace/packages/extension" },
      }),
    ).resolves.not.toThrow();

    // The output-channel logger is mocked at suite scope; we just verify the
    // command surface is still registered so the user has a recovery path.
    expect(registerCommand).toHaveBeenCalledWith("dextree.indexFile", expect.any(Function));
  });

  it("registers focused Mermaid export commands (slice 030 US3)", async () => {
    createIndexer.mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      indexFile: vi.fn(),
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "empty",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: null,
      }),
      getSymbols: vi.fn(),
      getAllFiles: vi.fn().mockResolvedValue([]),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      dispose: vi.fn(),
    });

    const extension = await import("./extension.js");
    const subscriptions: { dispose(): void }[] = [];

    await extension.activate({
      subscriptions,
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    const registeredCommands = registerCommand.mock.calls.map((c) => c[0]);
    expect(registeredCommands).toContain("dextree.exportCallers");
    expect(registeredCommands).toContain("dextree.exportCallees");
    expect(registeredCommands).toContain("dextree.exportClassHierarchy");
    expect(registeredCommands).toContain("dextree.exportPackage");
    expect(registeredCommands).toContain("dextree.exportTrace");
    expect(registeredCommands).toContain("dextree.exportCurrentView");
  });
});
