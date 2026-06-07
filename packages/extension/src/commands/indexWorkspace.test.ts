import { beforeEach, describe, expect, it, vi } from "vitest";

const showInformationMessage = vi.fn();
const findFiles = vi.fn();
const resolveCacheIdentity = vi.fn();
const createWorkspaceIgnore = vi.fn();
const executeCommand = vi.fn();

const workspaceState: { workspaceFolders: Array<{ uri: { fsPath: string }; name: string }> } = {
  workspaceFolders: [],
};

vi.mock("vscode", () => ({
  window: {
    showInformationMessage,
  },
  workspace: {
    get workspaceFolders() {
      return workspaceState.workspaceFolders;
    },
    findFiles,
  },
  commands: {
    executeCommand,
  },
}));

vi.mock("../cache/resolveCacheIdentity.js", () => ({
  resolveCacheIdentity,
}));

vi.mock("@dextree/core", () => ({
  createWorkspaceIgnore,
}));

function createMockIndexer() {
  return {
    initialize: vi.fn(),
    indexFile: vi.fn().mockResolvedValue({
      relativePath: "src/file.ts",
      symbolCount: 0,
      symbols: [],
      elapsedMs: 5,
    }),
    finalizeWorkspace: vi.fn().mockResolvedValue(undefined),
    detectWorkspaceFrameworks: vi.fn().mockResolvedValue([]),
    validateWorkspaceCache: vi.fn(),
    getSymbols: vi.fn(),
    getAllFiles: vi.fn(),
    getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [], frameworks: [] }),
    clearWorkspace: vi
      .fn()
      .mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 }),
    clearFile: vi.fn().mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 }),
    clearAll: vi.fn().mockResolvedValue({ clearedTables: 0 }),
    getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
    getCoverageReport: vi
      .fn()
      .mockResolvedValue({ rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 }),
    neighborhood: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
    getSessionSummary: vi.fn().mockResolvedValue({}),
    dispose: vi.fn(),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  // Reset module registry so the module-level `isIndexing` flag in
  // indexWorkspace.ts cannot leak between tests.  Each test gets a fresh
  // import on its first `await import("./indexWorkspace.js")`.
  vi.resetModules();

  showInformationMessage.mockReset();
  findFiles.mockReset();
  resolveCacheIdentity.mockReset();
  createWorkspaceIgnore.mockReset();
  executeCommand.mockReset();
  executeCommand.mockResolvedValue(undefined);

  workspaceState.workspaceFolders = [{ uri: { fsPath: "/workspace" }, name: "workspace" }];

  resolveCacheIdentity.mockResolvedValue({
    cacheKey: "/workspace",
    workspaceRoot: "/workspace",
    repoRoot: null,
    repoRemote: null,
  });

  createWorkspaceIgnore.mockResolvedValue({
    ignores: () => false,
  });

  findFiles.mockResolvedValue([
    { fsPath: "/workspace/src/a.ts" },
    { fsPath: "/workspace/src/b.ts" },
    { fsPath: "/workspace/src/c.ts" },
  ]);
});

describe("createIndexWorkspaceCommand — file discovery + ignore filter", () => {
  it("calls findFiles with the supported-language glob", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(findFiles).toHaveBeenCalledOnce();
    const [includeGlob] = findFiles.mock.calls[0]!;
    expect(includeGlob).toContain("ts");
    expect(includeGlob).toContain("tsx");
    expect(includeGlob).toContain("py");
    expect(includeGlob).toContain("md");
  });

  it("invokes createWorkspaceIgnore with the workspace root", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(createWorkspaceIgnore).toHaveBeenCalledWith("/workspace", expect.any(Object));
  });

  it("does NOT pass ignored files to indexer.indexFile", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();

    createWorkspaceIgnore.mockResolvedValueOnce({
      ignores: (path: string) => path.endsWith("b.ts"),
    });

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    const indexedPaths = indexer.indexFile.mock.calls.map((call) => call[0]);
    expect(indexedPaths).toContain("/workspace/src/a.ts");
    expect(indexedPaths).toContain("/workspace/src/c.ts");
    expect(indexedPaths).not.toContain("/workspace/src/b.ts");
  });
});

describe("createIndexWorkspaceCommand — clean reindex via clearWorkspace", () => {
  it("calls indexer.clearWorkspace BEFORE the first indexFile call", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();

    const callOrder: string[] = [];
    indexer.clearWorkspace.mockImplementationOnce(async () => {
      callOrder.push("clear");
      return { deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 };
    });
    indexer.indexFile.mockImplementation(async () => {
      callOrder.push("index");
      return { relativePath: "x", symbolCount: 0, symbols: [], elapsedMs: 1 };
    });

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(callOrder[0]).toBe("clear");
    expect(callOrder.slice(1).every((step) => step === "index")).toBe(true);
    expect(indexer.clearWorkspace).toHaveBeenCalledWith("/workspace");
  });
});

describe("createIndexWorkspaceCommand — cancellation", () => {
  it("stops indexing after the current file when cancellation is requested", async () => {
    const { createIndexWorkspaceCommand, requestWorkspaceIndexingCancel } =
      await import("./indexWorkspace.js");
    const indexer = createMockIndexer();

    let callCount = 0;
    indexer.indexFile.mockImplementation(async () => {
      callCount++;
      // Cancel after first file is indexed
      if (callCount >= 1) requestWorkspaceIndexingCancel();
      return { relativePath: "x", symbolCount: 0, symbols: [], elapsedMs: 1 };
    });

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(indexer.indexFile.mock.calls.length).toBeLessThan(3);
  });

  it("does not throw when cancellation interrupts the loop", async () => {
    const { createIndexWorkspaceCommand, requestWorkspaceIndexingCancel } =
      await import("./indexWorkspace.js");
    const indexer = createMockIndexer();

    indexer.indexFile.mockImplementation(async () => {
      requestWorkspaceIndexingCancel();
      return { relativePath: "x", symbolCount: 0, symbols: [], elapsedMs: 1 };
    });

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await expect(command()).resolves.toBeUndefined();
  });
});

describe("createIndexWorkspaceCommand — single-in-flight guard", () => {
  it("refuses a second concurrent invocation with an info message", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();

    let firstIndexCallSeen = false;
    const resolvers: Array<() => void> = [];
    indexer.indexFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          firstIndexCallSeen = true;
          resolvers.push(() =>
            resolve({ relativePath: "x", symbolCount: 0, symbols: [], elapsedMs: 1 }),
          );
        }),
    );

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    const firstInvocation = command();

    // Yield until the first invocation has actually entered the indexing loop.
    for (let i = 0; i < 20 && !firstIndexCallSeen; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(firstIndexCallSeen).toBe(true);

    // The first invocation is now blocked inside the loop.  A second
    // concurrent invocation MUST see the isIndexing guard and bail out.
    await command();

    const infoCalls = showInformationMessage.mock.calls.map((args) => String(args[0]));
    const guardMessage = infoCalls.find((msg) => msg.toLowerCase().includes("already in progress"));
    expect(guardMessage).toBeDefined();

    // Drain the first invocation. Each yielded indexFile schedules another
    // until the file list is exhausted, so we alternate: resolve any pending,
    // then yield, then check if more arrived.
    let firstInvocationDone = false;
    void firstInvocation.then(() => {
      firstInvocationDone = true;
    });
    for (let attempt = 0; attempt < 100 && !firstInvocationDone; attempt += 1) {
      while (resolvers.length > 0) {
        resolvers.shift()!();
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    await firstInvocation;
  }, 10_000);
});

describe("createIndexWorkspaceCommand — per-file failure tolerance", () => {
  it("logs failures and continues with remaining files", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const logger = createLogger();

    indexer.indexFile
      .mockResolvedValueOnce({ relativePath: "a", symbolCount: 0, symbols: [], elapsedMs: 1 })
      .mockRejectedValueOnce(new Error("parse error"))
      .mockResolvedValueOnce({ relativePath: "c", symbolCount: 0, symbols: [], elapsedMs: 1 });

    const command = createIndexWorkspaceCommand({
      logger,
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(indexer.indexFile).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalled();
    const summaryCall = showInformationMessage.mock.calls
      .map((args) => String(args[0]))
      .find((msg) => msg.includes("failed"));
    expect(summaryCall).toBeDefined();
  });
});

describe("createIndexWorkspaceCommand — indexing lifecycle callbacks", () => {
  it("reports start, per-file progress, and finished callbacks", async () => {
    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const onIndexingStarted = vi.fn();
    const onIndexingProgress = vi.fn();
    const onIndexingFinished = vi.fn();

    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
      onIndexingStarted,
      onIndexingProgress,
      onIndexingFinished,
    });

    await command();

    expect(onIndexingStarted).toHaveBeenCalledWith({
      current: 0,
      total: 3,
      fileName: null,
      failed: 0,
      cancelled: false,
      status: "starting",
    });
    expect(onIndexingProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        current: 1,
        total: 3,
        fileName: "a.ts",
        status: "indexing",
      }),
    );
    expect(onIndexingFinished).toHaveBeenCalledWith({
      current: 3,
      total: 3,
      fileName: "c.ts",
      failed: 0,
      cancelled: false,
      status: "completed",
    });
  });
});
