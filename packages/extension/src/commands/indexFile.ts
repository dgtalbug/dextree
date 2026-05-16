import type { IndexResult, Indexer } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";

interface CommandUriLike {
  fsPath: string;
}

export interface CommandContext {
  storageUri: CommandUriLike | undefined;
  extensionUri: CommandUriLike;
}

export interface IndexFileCommandDependencies {
  context: CommandContext;
  logger: Logger;
  getIndexer: () => Promise<Indexer>;
}

function formatKind(result: IndexResult): string | null {
  const firstSymbol = result.symbols[0];

  if (firstSymbol === undefined) {
    return null;
  }

  return `${firstSymbol.name} (${firstSymbol.kind[0]?.toUpperCase() ?? ""}${firstSymbol.kind.slice(1)})`;
}

export function createIndexFileCommand(
  dependencies: IndexFileCommandDependencies,
): () => Promise<void> {
  const inFlight = new Set<string>();

  return async () => {
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
      await vscode.window.showInformationMessage("Dextree: Open a TypeScript file to index.");
      return;
    }

    const { document } = editor;

    if (document.languageId !== "typescript") {
      await vscode.window.showInformationMessage("Dextree supports only TypeScript files in S1.");
      return;
    }

    if (dependencies.context.storageUri === undefined) {
      await vscode.window.showInformationMessage(
        "Dextree storage is unavailable for this workspace.",
      );
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (workspaceFolder === undefined) {
      await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
      return;
    }

    const absolutePath = document.uri.fsPath;

    if (inFlight.has(absolutePath)) {
      return;
    }

    inFlight.add(absolutePath);

    try {
      await vscode.workspace.fs.createDirectory(
        dependencies.context.storageUri as unknown as vscode.Uri,
      );

      dependencies.logger.debug(`Indexing: ${absolutePath}`);

      const indexer = await dependencies.getIndexer();
      const result = await indexer.indexFile(absolutePath, workspaceFolder.uri.fsPath);

      dependencies.logger.debug(`Parsed ${result.symbolCount} symbols`);
      dependencies.logger.debug(`Written to DuckDB (${result.relativePath})`);

      const formattedKind = formatKind(result);

      if (formattedKind === null) {
        await vscode.window.showInformationMessage(
          `Dextree found 0 symbols in ${result.relativePath}.`,
        );
      } else {
        await vscode.window.showInformationMessage(`Dextree found: ${formattedKind}`);
      }
    } catch (error) {
      dependencies.logger.error(`Failed to index ${absolutePath}`, error);
      await vscode.window.showErrorMessage("Dextree failed to index the active file.");
    } finally {
      inFlight.delete(absolutePath);
    }
  };
}
