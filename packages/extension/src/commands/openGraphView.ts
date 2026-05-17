import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";
import { WebviewPanelManager } from "../webview/panel.js";

/**
 * Registers the `dextree.openGraphView` command.
 *
 * When invoked, opens the Dextree Graph View webview panel (or reveals it if
 * already open), then queries the current workspace subgraph and pushes it to
 * the panel.
 *
 * @param context - The VS Code extension context
 * @param getIndexer - Lazy accessor for the shared Indexer instance
 * @returns A Disposable that unregisters the command
 */
export function registerOpenGraphViewCommand(
  context: vscode.ExtensionContext,
  getIndexer: () => Promise<Indexer>,
): vscode.Disposable {
  return vscode.commands.registerCommand("dextree.openGraphView", async () => {
    WebviewPanelManager.create(context);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    try {
      const indexer = await getIndexer();
      const graph =
        workspaceRoot === undefined
          ? { nodes: [], edges: [] }
          : await indexer.getWorkspaceSubgraph(workspaceRoot);

      WebviewPanelManager.pushGraph(graph);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await vscode.window.showErrorMessage(`Dextree: Failed to load graph — ${message}`);
    }
  });
}
