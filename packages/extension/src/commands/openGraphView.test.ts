import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock
// ---------------------------------------------------------------------------

const createWebviewPanel = vi.fn(() => ({
  webview: {
    html: "",
    cspSource: "https://mock-csp-source.com",
    asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `webview:///${uri.fsPath}` }),
    onDidReceiveMessage: vi.fn(),
    postMessage: vi.fn(),
  },
  onDidDispose: vi.fn(),
  reveal: vi.fn(),
  dispose: vi.fn(),
}));

const registerCommand = vi.fn((_cmd, handler) => ({ dispose: vi.fn(), handler }));
const showErrorMessage = vi.fn();
const resolveCacheIdentity = vi.fn();

vi.mock("vscode", () => ({
  window: {
    createWebviewPanel,
    showTextDocument: vi.fn(),
    showErrorMessage,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    openTextDocument: vi.fn(),
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
    }),
    file: (path: string) => ({ fsPath: path }),
  },
  ViewColumn: { One: 1 },
  commands: {
    registerCommand,
  },
  Position: class MockPosition {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  },
  Range: class MockRange {
    constructor(
      public start: { line: number; character: number },
      public end: { line: number; character: number },
    ) {}
  },
  Selection: class MockSelection {
    constructor(
      public anchor: { line: number; character: number },
      public active: { line: number; character: number },
    ) {}
  },
}));

vi.mock("../cache/resolveCacheIdentity.js", () => ({
  resolveCacheIdentity,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerOpenGraphViewCommand", () => {
  beforeEach(() => {
    vi.resetModules();
    registerCommand.mockClear();
    createWebviewPanel.mockClear();
    showErrorMessage.mockClear();
    resolveCacheIdentity.mockReset();
    resolveCacheIdentity.mockResolvedValue({
      cacheKey: "/workspace",
      workspaceRoot: "/workspace",
      repoRoot: null,
      repoRemote: null,
    });
  });

  it("registers the dextree.openGraphView command", async () => {
    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    const getIndexer = vi.fn();
    registerOpenGraphViewCommand(context as never, getIndexer);
    expect(registerCommand).toHaveBeenCalledWith("dextree.openGraphView", expect.any(Function));
  });

  it("returns a disposable", async () => {
    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    const getIndexer = vi.fn();
    const disposable = registerOpenGraphViewCommand(context as never, getIndexer);
    expect(typeof disposable.dispose).toBe("function");
  });

  it("opens a webview panel when the command handler is invoked", async () => {
    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    const getIndexer = vi.fn().mockResolvedValue({
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
          graphNodeCount: 0,
          graphEdgeCount: 0,
        },
      }),
      getWorkspaceSubgraph: vi.fn().mockResolvedValue({
        nodes: [],
        edges: [],
      }),
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      neighborhood: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
    });
    registerOpenGraphViewCommand(context as never, getIndexer as never);

    // Invoke the registered command handler
    const registeredHandler = registerCommand.mock.calls[0]?.[1];
    await registeredHandler?.();

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
  });

  it("shows error message when getIndexer throws", async () => {
    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    const getIndexer = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    registerOpenGraphViewCommand(context as never, getIndexer as never);

    const registeredHandler = registerCommand.mock.calls[0]?.[1];
    await registeredHandler?.();

    expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("DB unavailable"));
  });

  it("loads the graph only when the workspace cache validates as ready", async () => {
    const getWorkspaceSubgraph = vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
    });

    const getIndexer = vi.fn().mockResolvedValue({
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
          graphNodeCount: 0,
          graphEdgeCount: 0,
        },
      }),
      getWorkspaceSubgraph,
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      neighborhood: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
    });

    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    registerOpenGraphViewCommand(
      {
        subscriptions: [],
        extensionUri: { fsPath: "/extension" },
      } as never,
      getIndexer as never,
    );

    const registeredHandler = registerCommand.mock.calls[0]?.[1];
    await registeredHandler?.();

    expect(resolveCacheIdentity).toHaveBeenCalledWith({ workspaceRoot: "/workspace" });
    expect(getWorkspaceSubgraph).toHaveBeenCalledWith("/workspace");
  });

  it("keeps the graph in fallback state when the workspace cache is missing", async () => {
    const getWorkspaceSubgraph = vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
    });

    const getIndexer = vi.fn().mockResolvedValue({
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
      getWorkspaceSubgraph,
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      neighborhood: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
    });

    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    registerOpenGraphViewCommand(
      {
        subscriptions: [],
        extensionUri: { fsPath: "/extension" },
      } as never,
      getIndexer as never,
    );

    const registeredHandler = registerCommand.mock.calls[0]?.[1];
    await registeredHandler?.();

    expect(getWorkspaceSubgraph).not.toHaveBeenCalled();
  });

  it("keeps the graph in fallback state when the workspace cache is invalid", async () => {
    const getWorkspaceSubgraph = vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
    });

    const getIndexer = vi.fn().mockResolvedValue({
      validateWorkspaceCache: vi.fn().mockResolvedValue({
        status: "invalid",
        reason: "identity-mismatch",
        identity: {
          cacheKey: "/workspace",
          workspaceRoot: "/workspace",
          repoRoot: null,
          repoRemote: null,
        },
        metadata: null,
      }),
      getWorkspaceSubgraph,
      getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
      getCoverageReport: vi
        .fn()
        .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
      neighborhood: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
    });

    const { registerOpenGraphViewCommand } = await import("./openGraphView.js");
    registerOpenGraphViewCommand(
      {
        subscriptions: [],
        extensionUri: { fsPath: "/extension" },
      } as never,
      getIndexer as never,
    );

    const registeredHandler = registerCommand.mock.calls[0]?.[1];
    await registeredHandler?.();

    // Graph view renders empty/not-indexed state — subgraph fetch skipped.
    expect(getWorkspaceSubgraph).not.toHaveBeenCalled();
  });
});
