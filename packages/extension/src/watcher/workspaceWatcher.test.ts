import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocks (declared outside describe blocks so vi.mock closures capture them)
// ---------------------------------------------------------------------------

const mockIndexFile = vi.fn();
const mockClearFile = vi.fn();
const mockGetAllFiles = vi.fn();
const mockIsIgnored = vi.fn().mockReturnValue(false);
const mockReadFile = vi.fn();
const mockCreateFileSystemWatcher = vi.fn();
const mockGetConfiguration = vi.fn();
const mockLogger = { debug: vi.fn(), error: vi.fn(), dispose: vi.fn() };

type EventHandler = (uri: { fsPath: string }) => void;
let onChangeHandler: EventHandler = () => {};
let onCreateHandler: EventHandler = () => {};
let onDeleteHandler: EventHandler = () => {};

function makeUri(fsPath: string) {
  return { fsPath };
}

function makeMockIndexer() {
  return {
    indexFile: mockIndexFile,
    clearFile: mockClearFile,
    getAllFiles: mockGetAllFiles,
    finalizeWorkspace: vi.fn().mockResolvedValue(undefined),
    detectWorkspaceFrameworks: vi.fn().mockResolvedValue([]),
    getSymbols: vi.fn(),
    initialize: vi.fn(),
    validateWorkspaceCache: vi.fn(),
    getWorkspaceSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [], frameworks: [] }),
    clearWorkspace: vi
      .fn()
      .mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 }),
    clearAll: vi.fn().mockResolvedValue({ clearedTables: 0 }),
    dispose: vi.fn(),
    getPresentEdgeKinds: vi.fn().mockResolvedValue([]),
    getSessionSummary: vi.fn().mockResolvedValue({}),
  };
}

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: mockCreateFileSystemWatcher,
    getConfiguration: mockGetConfiguration,
  },
  RelativePattern: class RelativePattern {
    base: string;
    pattern: string;
    constructor(base: string, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  },
}));

vi.mock("@dextree/core", () => ({
  createWorkspaceIgnore: () => Promise.resolve({ ignores: mockIsIgnored }),
}));

vi.mock("../commands/indexWorkspace.js", () => ({
  SUPPORTED_GLOB: "**/*.{ts,tsx}",
  EXCLUDE_GLOB: "**/node_modules/**",
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function setupFsWatcher() {
  mockCreateFileSystemWatcher.mockReturnValue({
    onDidChange: (cb: EventHandler) => {
      onChangeHandler = cb;
      return { dispose: vi.fn() };
    },
    onDidCreate: (cb: EventHandler) => {
      onCreateHandler = cb;
      return { dispose: vi.fn() };
    },
    onDidDelete: (cb: EventHandler) => {
      onDeleteHandler = cb;
      return { dispose: vi.fn() };
    },
    dispose: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  onChangeHandler = () => {};
  onCreateHandler = () => {};
  onDeleteHandler = () => {};
  mockIndexFile
    .mockReset()
    .mockResolvedValue({ relativePath: "file.ts", symbolCount: 1, symbols: [], elapsedMs: 5 });
  mockClearFile
    .mockReset()
    .mockResolvedValue({ deletedFiles: 1, deletedSymbols: 1, deletedEdges: 0 });
  mockGetAllFiles.mockReset().mockResolvedValue([]);
  mockIsIgnored.mockReturnValue(false);
  mockReadFile.mockReset();
  mockLogger.debug.mockReset();
  mockGetConfiguration.mockReturnValue({ get: () => false });
  setupFsWatcher();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// US1 — save-to-graph-refresh
// ---------------------------------------------------------------------------

describe("createWorkspaceWatcher — onDidChange", () => {
  it("re-indexes when stored hash differs from current file content", async () => {
    const filePath = "/workspace/src/changed.ts";
    mockReadFile.mockResolvedValue("export const x = 1;");
    mockGetAllFiles.mockResolvedValue([{ path: filePath, hash: "old-hash" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    const onIndexed = vi.fn();
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed,
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onChangeHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    expect(mockIndexFile).toHaveBeenCalledWith(filePath, "/workspace");
    expect(onIndexed).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("[watcher] re-indexed:"));
  });

  it("skips re-index when hash matches current file content (true no-op)", async () => {
    const filePath = "/workspace/src/unchanged.ts";
    const content = "export const x = 1;";
    mockReadFile.mockResolvedValue(content);
    mockGetAllFiles.mockResolvedValue([{ path: filePath, hash: sha256(content) }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    const onIndexed = vi.fn();
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed,
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onChangeHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    expect(mockIndexFile).not.toHaveBeenCalled();
    expect(onIndexed).not.toHaveBeenCalled();
  });

  it("debounces rapid saves: 10 events within 500 ms produce exactly 1 re-index", async () => {
    const filePath = "/workspace/src/rapid.ts";
    mockReadFile.mockResolvedValue("export const z = 3;");
    mockGetAllFiles.mockResolvedValue([{ path: filePath, hash: "old-hash" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed: vi.fn(),
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    for (let i = 0; i < 10; i++) {
      onChangeHandler(makeUri(filePath));
    }
    await vi.runAllTimersAsync();

    expect(mockIndexFile).toHaveBeenCalledTimes(1);
  });

  it("queues events while isWorkspaceIndexing is true; processes them after drainQueue", async () => {
    const filePath = "/workspace/src/queued.ts";
    mockReadFile.mockResolvedValue("export const q = 4;");
    mockGetAllFiles.mockResolvedValue([{ path: filePath, hash: "old-hash" }]);

    let indexing = true;

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    const watcher = createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed: vi.fn(),
      isWorkspaceIndexing: () => indexing,
      logger: mockLogger as never,
    });

    // Fire event while indexing — should be queued, not processed
    onChangeHandler(makeUri(filePath));
    await vi.runAllTimersAsync();
    expect(mockIndexFile).not.toHaveBeenCalled();

    // Simulate indexing finished; drain queue
    indexing = false;
    await watcher.drainQueue();

    expect(mockIndexFile).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkspaceWatcher — onDidCreate", () => {
  it("indexes a newly created file without a hash check", async () => {
    const filePath = "/workspace/src/new.ts";
    // FR-002 guard: must have at least 1 indexed file for events to process
    mockGetAllFiles.mockResolvedValue([{ path: "/workspace/src/existing.ts", hash: "hash-ex" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    const onIndexed = vi.fn();
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed,
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onCreateHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    expect(mockIndexFile).toHaveBeenCalledWith(filePath, "/workspace");
    expect(onIndexed).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// US2 — delete propagation
// ---------------------------------------------------------------------------

describe("createWorkspaceWatcher — onDidDelete", () => {
  it("calls clearFile and onIndexed when an indexed file is deleted", async () => {
    const filePath = "/workspace/src/deleted.ts";
    mockGetAllFiles.mockResolvedValue([{ path: filePath, hash: "hash-del" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    const onIndexed = vi.fn();
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed,
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onDeleteHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    expect(mockClearFile).toHaveBeenCalledWith(filePath);
    expect(onIndexed).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("[watcher] removed:"));
  });

  it("calls clearFile gracefully when path was not previously indexed (deletedFiles: 0)", async () => {
    const filePath = "/workspace/src/ghost.ts";
    mockClearFile.mockResolvedValue({ deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 });
    mockGetAllFiles.mockResolvedValue([{ path: "/workspace/src/other.ts", hash: "hash-x" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed: vi.fn(),
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onDeleteHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    // Should still call clearFile (it handles 0-row case gracefully)
    expect(mockClearFile).toHaveBeenCalledWith(filePath);
  });

  it("skips clearFile for paths matched by the ignore rules", async () => {
    const filePath = "/workspace/node_modules/pkg/index.ts";
    mockIsIgnored.mockReturnValue(true);
    mockGetAllFiles.mockResolvedValue([{ path: "/workspace/src/other.ts", hash: "hash-x" }]);

    const { createWorkspaceWatcher } = await import("./workspaceWatcher.js");
    createWorkspaceWatcher({
      workspaceRoot: "/workspace",
      getIndexer: async () => makeMockIndexer() as never,
      onIndexed: vi.fn(),
      isWorkspaceIndexing: () => false,
      logger: mockLogger as never,
    });

    onDeleteHandler(makeUri(filePath));
    await vi.runAllTimersAsync();

    expect(mockClearFile).not.toHaveBeenCalled();
  });
});
