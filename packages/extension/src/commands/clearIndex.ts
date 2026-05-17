import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";

export interface ClearIndexCommandDependencies {
  logger: Logger;
  getIndexer: () => Promise<Indexer>;
  onCleared?: () => void;
}

const CONFIRM = "Clear";
const CANCEL = "Cancel";

export function createClearWorkspaceIndexCommand(
  dependencies: ClearIndexCommandDependencies,
): () => Promise<void> {
  return async () => {
    const root = vscode.workspace.workspaceFolders?.[0];

    if (root === undefined) {
      await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Dextree: Clear all indexed data for ${root.name}? This cannot be undone.`,
      { modal: true },
      CONFIRM,
      CANCEL,
    );

    if (choice !== CONFIRM) {
      return;
    }

    try {
      const indexer = await dependencies.getIndexer();
      const summary = await indexer.clearWorkspace(root.uri.fsPath);

      dependencies.logger.debug(
        `Cleared workspace ${root.uri.fsPath} — files=${summary.deletedFiles} symbols=${summary.deletedSymbols} edges=${summary.deletedEdges}`,
      );

      await vscode.window.showInformationMessage(
        `Dextree: Cleared ${summary.deletedFiles} file(s), ${summary.deletedSymbols} symbol(s), ${summary.deletedEdges} edge(s).`,
      );

      dependencies.onCleared?.();
    } catch (error) {
      dependencies.logger.error("Failed to clear workspace index", error);
      await vscode.window.showErrorMessage("Dextree: Failed to clear workspace index.");
    }
  };
}

export function createClearAllIndexCommand(
  dependencies: ClearIndexCommandDependencies,
): () => Promise<void> {
  return async () => {
    const choice = await vscode.window.showWarningMessage(
      "Dextree: Clear ALL indexed data across every workspace? This cannot be undone.",
      { modal: true },
      CONFIRM,
      CANCEL,
    );

    if (choice !== CONFIRM) {
      return;
    }

    try {
      const indexer = await dependencies.getIndexer();
      const summary = await indexer.clearAll();

      dependencies.logger.debug(`Cleared all Dextree data (${summary.clearedTables} tables)`);

      await vscode.window.showInformationMessage("Dextree: All indexed data cleared.");

      dependencies.onCleared?.();
    } catch (error) {
      dependencies.logger.error("Failed to clear all index data", error);
      await vscode.window.showErrorMessage("Dextree: Failed to clear all index data.");
    }
  };
}
