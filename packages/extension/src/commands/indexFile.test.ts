import { beforeEach, describe, expect, it, vi } from "vitest";

const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();
const createDirectory = vi.fn();
const getWorkspaceFolder = vi.fn();

const mockState = {
  activeTextEditor: null as null | {
    document: {
      languageId: string;
      uri: { fsPath: string };
    };
  },
};

vi.mock("vscode", () => ({
  window: {
    get activeTextEditor() {
      return mockState.activeTextEditor;
    },
    showInformationMessage,
    showErrorMessage,
  },
  workspace: {
    fs: {
      createDirectory,
    },
    getWorkspaceFolder,
  },
}));

function createMockIndexer() {
  return {
    initialize: vi.fn(),
    indexFile: vi.fn(),
    getSymbols: vi.fn(),
    getAllFiles: vi.fn(),
    dispose: vi.fn(),
  };
}

function createContext() {
  return {
    storageUri: { fsPath: "/workspace/.storage" },
    extensionUri: { fsPath: "/workspace/packages/extension" },
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("createIndexFileCommand", () => {
  beforeEach(() => {
    mockState.activeTextEditor = null;
    showInformationMessage.mockReset();
    showErrorMessage.mockReset();
    createDirectory.mockReset();
    getWorkspaceFolder.mockReset();
  });

  it("shows the first discovered symbol for a TypeScript file", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");
    const logger = createLogger();
    const indexer = createMockIndexer();

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/greet.ts" },
      },
    };

    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });
    indexer.indexFile.mockResolvedValue({
      relativePath: "src/greet.ts",
      symbolCount: 1,
      elapsedMs: 12,
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
    });

    const command = createIndexFileCommand({
      context: createContext(),
      logger,
      getIndexer: async () => indexer,
    });

    await command();

    expect(indexer.indexFile).toHaveBeenCalledWith("/workspace/src/greet.ts", "/workspace");
    expect(showInformationMessage).toHaveBeenCalledWith("Dextree found: greet (Function)");
  });

  it("shows an unsupported-language message for non-TypeScript files", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");

    mockState.activeTextEditor = {
      document: {
        languageId: "go",
        uri: { fsPath: "/workspace/main.go" },
      },
    };

    const command = createIndexFileCommand({
      context: createContext(),
      logger: createLogger(),
      getIndexer: async () => createMockIndexer(),
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith("Dextree does not support go files yet.");
  });

  it("shows an informational message when workspace storage is unavailable", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/greet.ts" },
      },
    };

    const command = createIndexFileCommand({
      context: {
        ...createContext(),
        storageUri: undefined,
      },
      logger: createLogger(),
      getIndexer: async () => createMockIndexer(),
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith(
      "Dextree storage is unavailable for this workspace.",
    );
  });

  it("shows an error message when indexing fails", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");
    const logger = createLogger();
    const indexer = createMockIndexer();

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/deleted.ts" },
      },
    };

    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });
    indexer.indexFile.mockRejectedValue(new Error("ENOENT: deleted"));

    const command = createIndexFileCommand({
      context: createContext(),
      logger,
      getIndexer: async () => indexer,
    });

    await command();

    expect(showErrorMessage).toHaveBeenCalledWith("Dextree failed to index the active file.");
    expect(logger.error).toHaveBeenCalled();
  });

  it("calls onIndexed callback once after a successful index", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");
    const indexer = createMockIndexer();
    const onIndexed = vi.fn();

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/greet.ts" },
      },
    };

    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });
    indexer.indexFile.mockResolvedValue({
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
    });

    const command = createIndexFileCommand({
      context: createContext(),
      logger: createLogger(),
      getIndexer: async () => indexer,
      onIndexed,
    });

    await command();

    expect(onIndexed).toHaveBeenCalledOnce();
  });

  it("does not call onIndexed when indexing fails", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");
    const indexer = createMockIndexer();
    const onIndexed = vi.fn();

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/bad.ts" },
      },
    };

    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });
    indexer.indexFile.mockRejectedValue(new Error("DB error"));

    const command = createIndexFileCommand({
      context: createContext(),
      logger: createLogger(),
      getIndexer: async () => indexer,
      onIndexed,
    });

    await command();

    expect(onIndexed).not.toHaveBeenCalled();
  });

  it("silently ignores a concurrent invocation for the same file", async () => {
    const { createIndexFileCommand } = await import("./indexFile.js");
    const indexer = createMockIndexer();

    mockState.activeTextEditor = {
      document: {
        languageId: "typescript",
        uri: { fsPath: "/workspace/src/greet.ts" },
      },
    };

    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace" } });

    let resolveRun: (() => void) | undefined;
    indexer.indexFile.mockReturnValue(
      new Promise((resolve) => {
        resolveRun = () =>
          resolve({
            relativePath: "src/greet.ts",
            symbolCount: 0,
            elapsedMs: 1,
            symbols: [],
          });
      }),
    );

    const command = createIndexFileCommand({
      context: createContext(),
      logger: createLogger(),
      getIndexer: async () => indexer,
    });

    const first = command();
    const second = command();

    await Promise.resolve();
    await Promise.resolve();

    expect(indexer.indexFile).toHaveBeenCalledTimes(1);

    resolveRun?.();

    await first;
    await second;
  });
});
