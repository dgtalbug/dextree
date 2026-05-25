import type { Indexer } from "@dextree/core";
import { basename } from "node:path";
import * as vscode from "vscode";
import { resolveCacheIdentity } from "../cache/resolveCacheIdentity.js";
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
      if (workspaceRoot === undefined) {
        WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
        return;
      }

      const indexer = await getIndexer();
      const identity = await resolveCacheIdentity({ workspaceRoot });
      const validation = await indexer.validateWorkspaceCache(identity);

      if (validation.status !== "ready") {
        WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
        return;
      }

      const graph = await indexer.getWorkspaceSubgraph(workspaceRoot);
      const presentEdgeKinds = await indexer.getPresentEdgeKinds(workspaceRoot);

      WebviewPanelManager.pushGraph({
        ...graph,
        presentEdgeKinds,
        workspaceName: basename(workspaceRoot),
        workspaceFrameworks: graph.frameworks.map((fw) => fw.name),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await vscode.window.showErrorMessage(`Dextree: Failed to load graph — ${message}`);
    }
  });
}
