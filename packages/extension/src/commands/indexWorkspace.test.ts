import { beforeEach, describe, expect, it, vi } from "vitest";

const showInformationMessage = vi.fn();
const findFiles = vi.fn();
const resolveCacheIdentity = vi.fn();
const createWorkspaceIgnore = vi.fn();

const ProgressLocation = { Notification: 15 } as const;

let cancellationRequestedAfterCall: number | null = null;

type ProgressTask = (
  progress: { report: (value: { increment?: number; message?: string }) => void },
  token: { isCancellationRequested: boolean },
) => Promise<unknown>;

const withProgress = vi.fn(async (_options: unknown, task: ProgressTask) => {
  let calls = 0;
  const token = {
    get isCancellationRequested(): boolean {
      const shouldCancel =
        cancellationRequestedAfterCall !== null && calls >= cancellationRequestedAfterCall;
      calls += 1;
      return shouldCancel;
    },
  };

  const progress = { report: vi.fn() };
  if (task) {
    return task(progress, token);
  }
  return undefined;
});

const workspaceState: { workspaceFolders: Array<{ uri: { fsPath: string }; name: string }> } = {
  workspaceFolders: [],
};

vi.mock("vscode", () => ({
  window: {
    showInformationMessage,
    withProgress,
  },
  workspace: {
    get workspaceFolders() {
      return workspaceState.workspaceFolders;
    },
    findFiles,
  },
  ProgressLocation,
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
    validateWorkspaceCache: vi.fn(),
    getSymbols: vi.fn(),
    getAllFiles: vi.fn(),
    getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    clearWorkspace: vi
      .fn()
      .mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 }),
    clearAll: vi.fn().mockResolvedValue({ clearedTables: 0 }),
    dispose: vi.fn(),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
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
  withProgress.mockClear();
  cancellationRequestedAfterCall = null;

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

describe("createIndexWorkspaceCommand — FR-001 (file discovery + ignore filter)", () => {
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

    expect(createWorkspaceIgnore).toHaveBeenCalledWith("/workspace");
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

describe("createIndexWorkspaceCommand — FR-005 (clean reindex via clearWorkspace)", () => {
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

describe("createIndexWorkspaceCommand — FR-003 (cancellation)", () => {
  it("stops indexing after the current file when cancellation is requested", async () => {
    cancellationRequestedAfterCall = 1; // cancel after 1 file is checked

    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await command();

    expect(indexer.indexFile.mock.calls.length).toBeLessThan(3);
  });

  it("does not throw when cancellation interrupts the loop", async () => {
    cancellationRequestedAfterCall = 0; // cancel immediately

    const { createIndexWorkspaceCommand } = await import("./indexWorkspace.js");
    const indexer = createMockIndexer();
    const command = createIndexWorkspaceCommand({
      logger: createLogger(),
      getIndexer: () => Promise.resolve(indexer as never),
    });

    await expect(command()).resolves.toBeUndefined();
  });
});

describe("createIndexWorkspaceCommand — FR-004 (single-in-flight guard)", () => {
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

describe("createIndexWorkspaceCommand — FR-006 (per-file failure tolerance)", () => {
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
