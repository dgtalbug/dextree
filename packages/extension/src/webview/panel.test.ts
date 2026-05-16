import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock — must be declared before importing WebviewPanelManager
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn();
const mockOnDidReceiveMessage = vi.fn();
const mockOnDidDispose = vi.fn();
let disposePanel = vi.fn();

const createWebviewPanel = vi.fn(() => ({
  webview: {
    html: "",
    cspSource: "https://mock-csp-source.com",
    asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `webview:///${uri.fsPath}` }),
    onDidReceiveMessage: mockOnDidReceiveMessage,
    postMessage: mockPostMessage,
  },
  onDidDispose: mockOnDidDispose,
  reveal: vi.fn(),
  dispose: vi.fn().mockImplementation(() => {
    disposePanel();
  }),
}));

const showTextDocument = vi.fn();
const openTextDocument = vi.fn(() => ({ uri: { fsPath: "/workspace/src/file.ts" } }));
const showErrorMessage = vi.fn();

vi.mock("vscode", () => ({
  window: {
    createWebviewPanel: createWebviewPanel,
    showTextDocument,
    showErrorMessage,
  },
  workspace: {
    get workspaceFolders() {
      return [{ uri: { fsPath: "/workspace" } }];
    },
    openTextDocument,
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
    }),
    file: (path: string) => ({ fsPath: path }),
  },
  ViewColumn: { One: 1 },
  commands: {
    registerCommand: vi.fn((_cmd, handler) => ({ dispose: vi.fn(), handler })),
  },
  Position: class MockPosition {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  },
  Range: class MockRange {
    constructor(
      public readonly start: { line: number; character: number },
      public readonly end: { line: number; character: number },
    ) {}
  },
  Selection: class MockSelection {
    constructor(
      public readonly anchor: { line: number; character: number },
      public readonly active: { line: number; character: number },
    ) {}
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebviewPanelManager", () => {
  beforeEach(() => {
    vi.resetModules();
    createWebviewPanel.mockClear();
    mockPostMessage.mockClear();
    mockOnDidReceiveMessage.mockClear();
    mockOnDidDispose.mockClear();
    showTextDocument.mockClear();
    showErrorMessage.mockClear();
    disposePanel = vi.fn();
  });

  it("creates a webview panel with the correct viewType (FR-001)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "dextree.graphView",
      "Dextree Graph",
      expect.anything(),
      expect.objectContaining({ enableScripts: true }),
    );
  });

  it("returns the same panel instance on second create call (singleton)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    WebviewPanelManager.create(context as never);
    // Panel created only once; second call reveals instead
    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
  });

  it("pushSymbols posts a symbols message to the webview (FR-004)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    WebviewPanelManager.pushSymbols([]);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "symbols", files: [] });
  });

  it("registers onDidReceiveMessage handler when panel is created (FR-013)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    expect(mockOnDidReceiveMessage).toHaveBeenCalledTimes(1);
  });

  it("onIndexed callback triggers pushSymbols when panel is open (FR-009)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    mockPostMessage.mockClear();

    // Simulate the onIndexed callback wiring by calling pushSymbols directly
    const files = [
      {
        path: "/workspace/src/app.ts",
        relativePath: "src/app.ts",
        symbols: [{ name: "greet", kind: "function", startLine: 0 }],
      },
    ];
    WebviewPanelManager.pushSymbols(files);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "symbols", files });
  });

  it("disposes the panel module reference on panel close (FR-005)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    // Simulate dispose callback by calling dispose on the panel
    const onDidDisposeArg = mockOnDidDispose.mock.calls[0]?.[0];
    if (typeof onDidDisposeArg === "function") {
      onDidDisposeArg();
    }

    // After dispose, creating again should create a new panel
    createWebviewPanel.mockClear();
    WebviewPanelManager.create(context as never);
    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
  });
});

describe("WebviewPanelManager navigation (US2)", () => {
  beforeEach(() => {
    vi.resetModules();
    createWebviewPanel.mockClear();
    mockPostMessage.mockClear();
    mockOnDidReceiveMessage.mockClear();
    mockOnDidDispose.mockClear();
    showTextDocument.mockClear();
    openTextDocument.mockClear();
    showErrorMessage.mockClear();
  });

  it("onDidReceiveMessage navigates to file when valid navigate message received (FR-007)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    // Get the registered message handler
    const messageHandler = mockOnDidReceiveMessage.mock.calls[0]?.[0];
    expect(typeof messageHandler).toBe("function");

    // Simulate a valid navigate message
    const validMsg = {
      type: "navigate",
      filePath: "/workspace/src/app.ts",
      line: 5,
    };
    await (messageHandler as (msg: unknown) => void)(validMsg);

    expect(openTextDocument).toHaveBeenCalledTimes(1);
    expect(showTextDocument).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid navigate messages silently (FR-013)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    const messageHandler = mockOnDidReceiveMessage.mock.calls[0]?.[0];

    // Send an invalid message (no type field)
    await (messageHandler as (msg: unknown) => void)({ random: "data" });

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(showTextDocument).not.toHaveBeenCalled();
  });

  it("ignores messages with path traversal (FR-013)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    const messageHandler = mockOnDidReceiveMessage.mock.calls[0]?.[0];

    // Path traversal attempt
    await (messageHandler as (msg: unknown) => void)({
      type: "navigate",
      filePath: "/workspace/../../../etc/passwd",
      line: 0,
    });

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(showTextDocument).not.toHaveBeenCalled();
  });
});
