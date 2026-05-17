import * as vscode from "vscode";
import { getWebviewContent } from "./html.js";
import type { GraphMessage } from "./protocol/messages.js";
import { validateNavigateMessage } from "./validate.js";

// Module-level singleton — exactly one panel per extension session.
let currentPanel: vscode.WebviewPanel | undefined;
// Last graph pushed — re-sent when webview posts 'ready' (handles race condition).
let cachedGraph: GraphMessage | undefined;
let isWebviewReady = false;

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
        // Webview signals it's ready — re-push cached graph to avoid race condition
        if (
          typeof msg === "object" &&
          msg !== null &&
          (msg as Record<string, unknown>)["type"] === "ready"
        ) {
          isWebviewReady = true;
          if (cachedGraph !== undefined) {
            void currentPanel?.webview.postMessage(cachedGraph);
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
    };
    if (currentPanel === undefined || !isWebviewReady) return;
    void currentPanel.webview.postMessage(cachedGraph);
  },

  /**
   * Returns true if a panel is currently open (visible or retained in background).
   */
  isOpen(): boolean {
    return currentPanel !== undefined;
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
    });
  } catch {
    await vscode.window.showErrorMessage(`Dextree: Could not open file ${filePath}`);
  }
}
