import type { Indexer } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";
import { WebviewPanelManager } from "../webview/panel.js";

/**
 * Registers the `dextree.openGraphView` command.
 *
 * When invoked, opens the Dextree Graph View webview panel (or reveals it if
 * already open), then queries all indexed files and pushes them to the panel.
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
      const storedFiles = await indexer.getAllFiles();

      const filesWithSymbols = await Promise.all(
        storedFiles.map(async (file) => {
          const symbols = await indexer.getSymbols(file.relativePath);
          const absolutePath =
            workspaceRoot !== undefined
              ? join(workspaceRoot, file.relativePath)
              : file.relativePath;
          return {
            path: absolutePath,
            relativePath: file.relativePath,
            symbols: symbols.map((s) => ({
              name: s.name,
              kind: s.kind,
              startLine: s.range.startLine,
            })),
          };
        }),
      );

      WebviewPanelManager.pushSymbols(filesWithSymbols);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await vscode.window.showErrorMessage(`Dextree: Failed to load symbols — ${message}`);
    }
  });
}
