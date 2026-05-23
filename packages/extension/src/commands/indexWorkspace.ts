import { createWorkspaceIgnore, type Indexer } from "@dextree/core";
import { basename } from "node:path";
import * as vscode from "vscode";

import { resolveCacheIdentity } from "../cache/resolveCacheIdentity.js";
import type { Logger } from "../logger.js";

export interface IndexWorkspaceCommandDependencies {
  logger: Logger;
  getIndexer: () => Promise<Indexer>;
  onIndexingStarted?: (update: IndexWorkspaceProgressUpdate) => void;
  onIndexingProgress?: (update: IndexWorkspaceProgressUpdate) => void;
  onIndexingFinished?: (update: IndexWorkspaceProgressUpdate) => void;
  onIndexed?: () => void;
}

export type IndexWorkspaceProgressStatus =
  | "starting"
  | "indexing"
  | "failed"
  | "completed"
  | "cancelled";

export interface IndexWorkspaceProgressUpdate {
  current: number;
  total: number;
  fileName: string | null;
  failed: number;
  cancelled: boolean;
  status: IndexWorkspaceProgressStatus;
}

export const SUPPORTED_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,md}";
export const EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/build/**}";

let isIndexing = false;
let cancellationRequested = false;

/** Returns true while a full workspace index is in progress. */
export function isWorkspaceIndexing(): boolean {
  return isIndexing;
}

/** Request cancellation of the currently running workspace index. No-op if not indexing. */
export function requestWorkspaceIndexingCancel(): void {
  if (isIndexing) {
    cancellationRequested = true;
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function createIndexWorkspaceCommand(
  dependencies: IndexWorkspaceCommandDependencies,
): () => Promise<void> {
  return async () => {
    if (isIndexing) {
      await vscode.window.showInformationMessage("Dextree: Indexing already in progress.");
      return;
    }

    // Claim the guard synchronously before any await so a second invocation
    // that arrives during file discovery is correctly rejected.
    isIndexing = true;
    cancellationRequested = false;
    await vscode.commands.executeCommand("setContext", "dextree.isIndexing", true);

    try {
      const root = vscode.workspace.workspaceFolders?.[0];

      if (root === undefined) {
        await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
        return;
      }

      const discovered = await vscode.workspace.findFiles(SUPPORTED_GLOB, EXCLUDE_GLOB);
      const workspaceIgnore = await createWorkspaceIgnore(root.uri.fsPath);
      const files = discovered.filter((file) => !workspaceIgnore.ignores(file.fsPath));
      const skipped = discovered.length - files.length;

      if (files.length === 0) {
        await vscode.window.showInformationMessage(
          skipped > 0
            ? `Dextree: All ${skipped} discovered file(s) are ignored by .gitignore/.dextreeignore.`
            : "Dextree: No supported files found in workspace.",
        );
        return;
      }

      if (skipped > 0) {
        dependencies.logger.debug(
          `Skipped ${skipped} file(s) ignored by .gitignore/.dextreeignore`,
        );
      }

      const indexer = await dependencies.getIndexer();
      dependencies.onIndexingStarted?.({
        current: 0,
        total: files.length,
        fileName: null,
        failed: 0,
        cancelled: false,
        status: "starting",
      });
      await indexer.clearWorkspace(root.uri.fsPath);

      const cacheIdentity = await resolveCacheIdentity({
        workspaceRoot: root.uri.fsPath,
      });
      let indexed = 0;
      let failed = 0;
      let cancelled = false;
      const total = files.length;
      let lastFileName: string | null = null;

      for (const [index, file] of files.entries()) {
        if (cancellationRequested) {
          cancelled = true;
          break;
        }

        lastFileName = basename(file.fsPath);
        dependencies.onIndexingProgress?.({
          current: index + 1,
          total,
          fileName: lastFileName,
          failed,
          cancelled: false,
          status: "indexing",
        });

        try {
          await indexer.indexFile(file.fsPath, root.uri.fsPath, cacheIdentity);
          indexed++;
        } catch (error) {
          failed++;
          dependencies.logger.error(`Failed to index ${file.fsPath}`, error);
          dependencies.onIndexingProgress?.({
            current: index + 1,
            total,
            fileName: lastFileName,
            failed,
            cancelled: false,
            status: "failed",
          });
        }

        await yieldToEventLoop();
      }

      dependencies.onIndexed?.();
      dependencies.onIndexingFinished?.({
        current: cancelled ? indexed + failed : total,
        total,
        fileName: lastFileName,
        failed,
        cancelled,
        status: cancelled ? "cancelled" : "completed",
      });

      // Show a summary notification for failures or cancellations
      if (cancelled || failed > 0) {
        let summary: string;
        if (cancelled) {
          summary = `Cancelled — ${indexed} of ${total} file(s) indexed${failed > 0 ? ` (${failed} failed — see Dextree output)` : ""}.`;
        } else {
          summary = `Indexed ${indexed} files (${failed} failed — see Dextree output).`;
        }
        await vscode.window.showInformationMessage(`Dextree: ${summary}`);
      }
    } finally {
      isIndexing = false;
      await vscode.commands.executeCommand("setContext", "dextree.isIndexing", false);
    }
  };
}
