import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";

export interface IndexWorkspaceCommandDependencies {
  logger: Logger;
  getIndexer: () => Promise<Indexer>;
  onIndexed?: () => void;
}

const SUPPORTED_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,md}";
const EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/build/**}";

export function createIndexWorkspaceCommand(
  dependencies: IndexWorkspaceCommandDependencies,
): () => Promise<void> {
  return async () => {
    const root = vscode.workspace.workspaceFolders?.[0];

    if (root === undefined) {
      await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
      return;
    }

    const files = await vscode.workspace.findFiles(SUPPORTED_GLOB, EXCLUDE_GLOB);

    if (files.length === 0) {
      await vscode.window.showInformationMessage("Dextree: No supported files found in workspace.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Dextree: Indexing ${files.length} files`,
        cancellable: true,
      },
      async (progress, token) => {
        let indexed = 0;
        let failed = 0;
        const total = files.length;

        for (const file of files) {
          if (token.isCancellationRequested) {
            break;
          }

          progress.report({
            increment: (1 / total) * 100,
            message: `${indexed + 1} / ${total}`,
          });

          try {
            const indexer = await dependencies.getIndexer();
            await indexer.indexFile(file.fsPath, root.uri.fsPath);
            indexed++;
          } catch (error) {
            failed++;
            dependencies.logger.error(`Failed to index ${file.fsPath}`, error);
          }
        }

        dependencies.onIndexed?.();

        const summary =
          failed > 0
            ? `Indexed ${indexed} files (${failed} failed — see Dextree output).`
            : `Indexed ${indexed} files.`;

        await vscode.window.showInformationMessage(`Dextree: ${summary}`);
      },
    );
  };
}
