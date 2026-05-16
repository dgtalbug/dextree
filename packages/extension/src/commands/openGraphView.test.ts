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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerOpenGraphViewCommand", () => {
  beforeEach(() => {
    vi.resetModules();
    registerCommand.mockClear();
    createWebviewPanel.mockClear();
    showErrorMessage.mockClear();
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
      getAllFiles: vi
        .fn()
        .mockResolvedValue([{ id: "1", relativePath: "src/app.ts", language: "typescript" }]),
      getSymbols: vi.fn().mockResolvedValue([
        {
          id: "s1",
          fqn: "greet",
          name: "greet",
          kind: "function",
          fileId: "1",
          range: { startLine: 5, startCol: 0, endLine: 8, endCol: 1 },
          language: "typescript",
        },
      ]),
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
});
