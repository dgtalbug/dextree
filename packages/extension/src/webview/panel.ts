import * as vscode from "vscode";
import { getWebviewContent } from "./html.js";
import type {
  CommandMessage,
  GraphMessage,
  HostToWebviewMessage,
  IndexedWorkspaceRecord,
  IndexingMessage,
  WorkspaceListMessage,
} from "./protocol/messages.js";
import { validateNavigateMessage } from "./validate.js";

// Whitelisted webview→host commands. Only these command IDs are allowed.
const WEBVIEW_COMMANDS: Record<string, string> = {
  "index-workspace": "dextree.indexWorkspace",
  "cancel-indexing": "dextree.cancelWorkspaceIndexing",
  "clear-workspace": "dextree.clearWorkspaceIndex",
  "clear-all": "dextree.clearAllIndex",
  "export-mermaid": "dextree.exportMermaid",
};

// Module-level singleton — exactly one panel per extension session.
let currentPanel: vscode.WebviewPanel | undefined;
// Last graph pushed — re-sent when webview posts 'ready' (handles race condition).
let cachedGraph: GraphMessage | undefined;
let cachedIndexing: IndexingMessage | undefined;
let isWebviewReady = false;

// Slice 024 — injected by extension.ts so panel.ts stays decoupled from the
// workspace registry / cache layer. Both handlers return without effect when
// undefined (the webview just sees no response).
let listIndexedWorkspacesHandler: (() => Promise<IndexedWorkspaceRecord[]>) | undefined;
let switchWorkspaceHandler: ((workspaceRoot: string) => Promise<void>) | undefined;

function postCachedState(): void {
  if (currentPanel === undefined || !isWebviewReady) {
    return;
  }

  const messages: HostToWebviewMessage[] = [];

  if (cachedGraph !== undefined) {
    messages.push(cachedGraph);
  }

  if (cachedIndexing !== undefined) {
    messages.push(cachedIndexing);
  }

  for (const message of messages) {
    void currentPanel.webview.postMessage(message);
  }
}

function postMessage(message: HostToWebviewMessage): void {
  if (currentPanel === undefined || !isWebviewReady) {
    return;
  }

  void currentPanel.webview.postMessage(message);
}

/**
 * Manages the Dextree Graph View webview panel (FR-001 through FR-013).
 *
 * Use `WebviewPanelManager.create()` to open or reveal the panel.
 * Use `WebviewPanelManager.pushGraph()` to push an updated graph payload.
 */
export const WebviewPanelManager = {
  /**
   * Creates a new webview panel, or reveals the existing one if already open.
   * On creation, immediately posts the current symbol list (FR-004).
   */
  create(context: vscode.ExtensionContext): void {
    if (currentPanel !== undefined) {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    currentPanel = vscode.window.createWebviewPanel(
      "dextree.graphView",
      "Dextree Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
        retainContextWhenHidden: true,
      },
    );

    currentPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "dextree.svg");
    isWebviewReady = false;

    // Navigation messages from the webview (FR-007, FR-013)
    currentPanel.webview.onDidReceiveMessage(
      (msg: unknown) => {
        if (typeof msg !== "object" || msg === null) return;
        const record = msg as Record<string, unknown>;

        // Webview signals it's ready — re-push cached graph to avoid race condition
        if (record["type"] === "ready") {
          isWebviewReady = true;
          postCachedState();
          return;
        }

        // Webview dispatches a whitelisted VS Code command
        if (record["type"] === "command") {
          const cmdMsg = msg as CommandMessage;
          const vsCommand = WEBVIEW_COMMANDS[cmdMsg.command];
          if (vsCommand !== undefined) {
            void vscode.commands.executeCommand(vsCommand);
          }
          return;
        }

        // Slice 024 — webview asks for the list of indexed workspaces
        if (record["type"] === "requestWorkspaceList") {
          const provider = listIndexedWorkspacesHandler;
          if (provider !== undefined) {
            void provider()
              .then((workspaces) => {
                const reply: WorkspaceListMessage = {
                  type: "workspaceList",
                  workspaces,
                };
                postMessage(reply);
              })
              .catch(() => {
                postMessage({ type: "workspaceList", workspaces: [] });
              });
          }
          return;
        }

        // Slice 024 — webview asks to switch to a different workspace
        if (record["type"] === "switchWorkspace") {
          const target = record["workspaceRoot"];
          const handler = switchWorkspaceHandler;
          if (handler !== undefined && typeof target === "string" && target.length > 0) {
            void handler(target).catch(() => {
              // Errors are surfaced as VS Code notifications inside the handler.
            });
          }
          return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const validated = validateNavigateMessage(msg, workspaceRoot);
        if (validated === null) {
          // Silent ignore per FR-013 — invalid or untrusted message
          return;
        }
        void navigateToSymbol(validated.filePath, validated.line);
      },
      undefined,
      context.subscriptions,
    );

    // Register handlers before loading the webview so an eager `ready` message
    // from the client cannot race ahead of the host listener.
    currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri);

    // Clean up module reference when panel is closed (FR-005)
    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
        cachedGraph = undefined;
        cachedIndexing = undefined;
        isWebviewReady = false;
      },
      undefined,
      context.subscriptions,
    );

    context.subscriptions.push(currentPanel);
  },

  /**
   * Pushes an updated graph payload to the open webview panel.
   * No-op if no panel is currently open.
   */
  pushGraph(graph: Omit<GraphMessage, "type">): void {
    cachedGraph = {
      type: "graph",
      nodes: graph.nodes,
      edges: graph.edges,
      ...(graph.presentEdgeKinds !== undefined && { presentEdgeKinds: graph.presentEdgeKinds }),
      ...(graph.workspaceName !== undefined && { workspaceName: graph.workspaceName }),
      ...(graph.workspaceFrameworks !== undefined && {
        workspaceFrameworks: graph.workspaceFrameworks,
      }),
    };
    postCachedState();
  },

  pushIndexing(indexing: Omit<IndexingMessage, "type">): void {
    const message: IndexingMessage = {
      type: "indexing",
      ...indexing,
    };

    if (message.phase === "finished") {
      cachedIndexing = undefined;
      postMessage(message);
      return;
    }

    cachedIndexing = message;
    postCachedState();
  },

  /**
   * Returns true if a panel is currently open (visible or retained in background).
   */
  isOpen(): boolean {
    return currentPanel !== undefined;
  },

  /**
   * Slice 024 — register host-side handlers for workspace switcher messages.
   * Called once during extension activation. Subsequent calls overwrite the
   * stored handlers (useful for tests).
   */
  setWorkspaceHandlers(handlers: {
    onRequestWorkspaceList?: () => Promise<IndexedWorkspaceRecord[]>;
    onSwitchWorkspace?: (workspaceRoot: string) => Promise<void>;
  }): void {
    listIndexedWorkspacesHandler = handlers.onRequestWorkspaceList;
    switchWorkspaceHandler = handlers.onSwitchWorkspace;
  },
};

async function navigateToSymbol(filePath: string, line: number): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(Math.max(line - 1, 0), 0);
    await vscode.window.showTextDocument(doc, {
      selection: new vscode.Selection(position, position),
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
  } catch {
    await vscode.window.showErrorMessage(`Dextree: Could not open file ${filePath}`);
  }
}
