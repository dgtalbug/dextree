import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock — must be declared before importing WebviewPanelManager
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn();
const mockOnDidReceiveMessage = vi.fn();
const mockOnDidDispose = vi.fn();
let disposePanel = vi.fn();
let triggerReadyOnHtmlAssignment = false;
let currentMessageHandler: ((message: unknown) => void) | undefined;
type MockWebview = {
  html: string;
  cspSource: string;
  asWebviewUri: (uri: { fsPath: string }) => { toString: () => string };
  onDidReceiveMessage: typeof mockOnDidReceiveMessage;
  postMessage: typeof mockPostMessage;
};

let lastPanel:
  | {
      iconPath?: { fsPath: string };
      webview: MockWebview;
      onDidDispose: typeof mockOnDidDispose;
      reveal: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }
  | undefined;

const createWebviewPanel = vi.fn(() => {
  let html = "";
  const webview: MockWebview = {
    html,
    cspSource: "https://mock-csp-source.com",
    asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `webview:///${uri.fsPath}` }),
    onDidReceiveMessage: mockOnDidReceiveMessage,
    postMessage: mockPostMessage,
  };

  Object.defineProperty(webview, "html", {
    get: () => html,
    set: (value: string) => {
      html = value;

      if (triggerReadyOnHtmlAssignment) {
        currentMessageHandler?.({ type: "ready" });
      }
    },
    enumerable: true,
    configurable: true,
  });

  lastPanel = {
    webview,
    onDidDispose: mockOnDidDispose,
    reveal: vi.fn(),
    dispose: vi.fn().mockImplementation(() => {
      disposePanel();
    }),
  };

  return lastPanel;
});

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
    executeCommand: vi.fn(),
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
    lastPanel = undefined;
    triggerReadyOnHtmlAssignment = false;
    currentMessageHandler = undefined;
    mockOnDidReceiveMessage.mockImplementation((handler: (message: unknown) => void) => {
      currentMessageHandler = handler;
    });
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

  it("sets a custom editor tab icon from extension resources", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };

    WebviewPanelManager.create(context as never);

    expect(lastPanel?.iconPath).toEqual({ fsPath: "/extension/resources/dextree.svg" });
  });

  it("pushGraph posts a graph message after the webview reports ready (FR-004)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    currentMessageHandler?.({ type: "ready" });
    WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "graph", nodes: [], edges: [] });
  });

  it("caches graph updates until the webview reports ready", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };

    WebviewPanelManager.create(context as never);
    WebviewPanelManager.pushGraph({ nodes: [], edges: [] });

    expect(mockPostMessage).not.toHaveBeenCalled();

    currentMessageHandler?.({ type: "ready" });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "graph", nodes: [], edges: [] });
  });

  it("replays cached graph and indexing state in ready order", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };

    WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
    WebviewPanelManager.pushIndexing({
      phase: "progress",
      current: 2,
      total: 3,
      fileName: "panel.ts",
      failed: 0,
      cancelled: false,
      status: "indexing",
    });
    mockPostMessage.mockClear();

    WebviewPanelManager.create(context as never);
    currentMessageHandler?.({ type: "ready" });

    expect(mockPostMessage.mock.calls[0]?.[0]).toEqual({ type: "graph", nodes: [], edges: [] });
    expect(mockPostMessage.mock.calls[1]?.[0]).toEqual({
      type: "indexing",
      phase: "progress",
      current: 2,
      total: 3,
      fileName: "panel.ts",
      failed: 0,
      cancelled: false,
      status: "indexing",
    });
  });

  it("does not replay finished indexing state after it has been sent", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };

    WebviewPanelManager.create(context as never);
    currentMessageHandler?.({ type: "ready" });
    mockPostMessage.mockClear();

    WebviewPanelManager.pushIndexing({
      phase: "finished",
      current: 4,
      total: 4,
      fileName: "panel.ts",
      failed: 0,
      cancelled: true,
      status: "cancelled",
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "indexing",
      phase: "finished",
      current: 4,
      total: 4,
      fileName: "panel.ts",
      failed: 0,
      cancelled: true,
      status: "cancelled",
    });

    mockPostMessage.mockClear();
    currentMessageHandler?.({ type: "ready" });
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("replays the cached graph when ready fires during initial html load", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };

    WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
    mockPostMessage.mockClear();
    triggerReadyOnHtmlAssignment = true;

    WebviewPanelManager.create(context as never);

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "graph", nodes: [], edges: [] });
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

  it("onIndexed callback triggers pushGraph when panel is open (FR-009)", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    currentMessageHandler?.({ type: "ready" });
    mockPostMessage.mockClear();

    // Simulate the onIndexed callback wiring by calling pushGraph directly
    const graph = {
      nodes: [
        {
          id: "file-1",
          type: "file" as const,
          label: "/workspace/src/app.ts",
          filePath: "/workspace/src/app.ts",
          startLine: 1,
        },
      ],
      edges: [],
    };
    WebviewPanelManager.pushGraph(graph);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "graph", ...graph });
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

  it("dispatches whitelisted command messages to vscode.commands.executeCommand", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const vscode = await import("vscode");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    const messageHandler = mockOnDidReceiveMessage.mock.calls[0]?.[0];

    await (messageHandler as (msg: unknown) => void)({
      type: "command",
      command: "clear-workspace",
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("dextree.clearWorkspaceIndex");
  });

  it("ignores unknown command IDs", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    const vscode = await import("vscode");
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);

    const messageHandler = mockOnDidReceiveMessage.mock.calls[0]?.[0];
    (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockClear();

    await (messageHandler as (msg: unknown) => void)({
      type: "command",
      command: "evil-command",
    });

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Slice 024 — workspace switcher message dispatch
// ---------------------------------------------------------------------------

describe("WebviewPanelManager workspace switcher (slice 024)", () => {
  beforeEach(() => {
    vi.resetModules();
    createWebviewPanel.mockClear();
    mockPostMessage.mockClear();
    mockOnDidReceiveMessage.mockClear();
    mockOnDidDispose.mockClear();
    triggerReadyOnHtmlAssignment = false;
    currentMessageHandler = undefined;
    mockOnDidReceiveMessage.mockImplementation((handler: (message: unknown) => void) => {
      currentMessageHandler = handler;
    });
  });

  function setupPanel(WebviewPanelManager: { create: (context: never) => void }) {
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
    };
    WebviewPanelManager.create(context as never);
    currentMessageHandler?.({ type: "ready" });
    mockPostMessage.mockClear();
  }

  it("requestWorkspaceList dispatches to the registered provider and posts workspaceList back", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    setupPanel(WebviewPanelManager);

    const sample = [
      {
        workspaceRoot: "/a",
        name: "a",
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 3,
        lastIndexedAt: null,
        frameworks: [] as string[],
        isActive: true,
      },
    ];

    WebviewPanelManager.setWorkspaceHandlers({
      onRequestWorkspaceList: async () => sample,
    });

    await currentMessageHandler?.({ type: "requestWorkspaceList" });
    // Allow the .then chain to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "workspaceList",
      workspaces: sample,
    });
  });

  it("requestWorkspaceList posts an empty list when the provider rejects", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    setupPanel(WebviewPanelManager);

    WebviewPanelManager.setWorkspaceHandlers({
      onRequestWorkspaceList: async () => {
        throw new Error("boom");
      },
    });

    await currentMessageHandler?.({ type: "requestWorkspaceList" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "workspaceList", workspaces: [] });
  });

  it("switchWorkspace dispatches to the registered handler with the requested workspaceRoot", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    setupPanel(WebviewPanelManager);

    const onSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
    WebviewPanelManager.setWorkspaceHandlers({ onSwitchWorkspace });

    await currentMessageHandler?.({ type: "switchWorkspace", workspaceRoot: "/b/widgets" });

    expect(onSwitchWorkspace).toHaveBeenCalledWith("/b/widgets");
  });

  it("switchWorkspace ignores messages without a workspaceRoot string", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    setupPanel(WebviewPanelManager);

    const onSwitchWorkspace = vi.fn();
    WebviewPanelManager.setWorkspaceHandlers({ onSwitchWorkspace });

    await currentMessageHandler?.({ type: "switchWorkspace" });
    await currentMessageHandler?.({ type: "switchWorkspace", workspaceRoot: "" });
    await currentMessageHandler?.({ type: "switchWorkspace", workspaceRoot: 42 });

    expect(onSwitchWorkspace).not.toHaveBeenCalled();
  });

  it("requestWorkspaceList is a no-op when no provider is registered", async () => {
    const { WebviewPanelManager } = await import("./panel.js");
    setupPanel(WebviewPanelManager);

    WebviewPanelManager.setWorkspaceHandlers({});

    await currentMessageHandler?.({ type: "requestWorkspaceList" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});
