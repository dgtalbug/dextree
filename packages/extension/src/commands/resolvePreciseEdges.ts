import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";
import { LspCallResolver } from "../resolution/lspCallResolver.js";

export interface ResolvePreciseEdgesDependencies {
  logger: Logger;
  getIndexer: () => Promise<Indexer>;
  /** Called after a successful pass so the graph view can re-project precise edges. */
  onResolved?: () => void;
}

/**
 * `Dextree: Resolve precise edges (LSP)` — the opt-in pass-2 that upgrades
 * persisted heuristic `CALLS` edges to the precise tier using the user's language
 * server, so the whole projected graph (not just an inspected node) is precise.
 * Runs under a cancellable progress notification; the indexer owns the work-list
 * + persistence, this command owns the LSP resolver + the UI.
 */
export function createResolvePreciseEdgesCommand(
  deps: ResolvePreciseEdgesDependencies,
): () => Promise<void> {
  return async () => {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (root === undefined) {
      await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
      return;
    }

    const indexer = await deps.getIndexer();
    const resolver = new LspCallResolver();

    const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Dextree: resolving precise edges (LSP)…",
        cancellable: true,
      },
      async (progress, token) => {
        let lastPct = 0;
        return indexer.resolvePreciseEdges(root.uri.fsPath, resolver, {
          isCancelled: () => token.isCancellationRequested,
          onProgress: ({ processed, total, upgraded }) => {
            if (total === 0) return;
            const pct = Math.floor((processed / total) * 100);
            // Report only the incremental delta vsCode expects, and a readable message.
            progress.report({
              increment: pct - lastPct,
              message: `${processed}/${total} sites · ${upgraded} upgraded`,
            });
            lastPct = pct;
          },
        });
      },
    );

    deps.logger.info(
      `Precise resolution: ${summary.upgraded}/${summary.total} CALLS upgraded${summary.cancelled ? " (cancelled)" : ""}`,
    );

    if (summary.upgraded > 0) {
      deps.onResolved?.();
    }

    const tail = summary.cancelled ? " (cancelled — partial results saved)" : "";
    await vscode.window.showInformationMessage(
      summary.total === 0
        ? "Dextree: no unresolved call edges to upgrade."
        : `Dextree: upgraded ${summary.upgraded} of ${summary.total} call edge(s) to precise${tail}.`,
    );
  };
}
