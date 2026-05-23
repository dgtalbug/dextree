import { EmptyGraphError, type Indexer, type SessionSummary } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";

export interface ExportSessionSummaryCommandDependencies {
  getIndexer: () => Promise<Pick<Indexer, "getSessionSummary">>;
}

let isExporting = false;

/** Resets the in-progress guard. Exposed for unit tests only. */
export function resetExportingStateForTests(): void {
  isExporting = false;
}

function renderSummaryMarkdown(summary: SessionSummary): string {
  const timestamp = summary.generatedAt.toISOString();

  const topFilesRows =
    summary.topFiles.length > 0
      ? summary.topFiles
          .map((f) => "| `" + f.path + "` | " + String(f.symbolCount) + " |")
          .join("\n")
      : "| (none) | 0 |";

  const edgeRows =
    summary.edgeKindCounts.length > 0
      ? summary.edgeKindCounts.map((e) => "| " + e.kind + " | " + String(e.count) + " |").join("\n")
      : "| (none) | 0 |";

  return [
    "# Dextree Session Summary",
    "",
    "**Workspace**: " + summary.workspaceName,
    "**Generated**: " + timestamp,
    "",
    "## Graph Statistics",
    "",
    "| Metric | Count |",
    "| ------ | ----- |",
    "| Indexed files | " + String(summary.fileCount) + " |",
    "| Indexed symbols | " + String(summary.symbolCount) + " |",
    "",
    "## Top Files by Symbol Count",
    "",
    "| File | Symbols |",
    "| ---- | ------- |",
    topFilesRows,
    "",
    "## Edge-Kind Summary",
    "",
    "| Kind | Count |",
    "| ---- | ----- |",
    edgeRows,
    "",
  ].join("\n");
}

export function createExportSessionSummaryCommand(
  dependencies: ExportSessionSummaryCommandDependencies,
): () => Promise<void> {
  return async () => {
    if (isExporting) {
      vscode.window.setStatusBarMessage("Dextree: Export already in progress", 3000);
      return;
    }

    isExporting = true;

    try {
      const root = vscode.workspace.workspaceFolders?.[0];

      if (root === undefined) {
        await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
        return;
      }

      const indexer = await dependencies.getIndexer();

      let summary: SessionSummary;
      try {
        summary = await indexer.getSessionSummary(root.uri.fsPath);
      } catch (err) {
        if (err instanceof EmptyGraphError) {
          await vscode.window.showInformationMessage(
            "Dextree: Index your workspace first before exporting a summary.",
          );
          return;
        }
        throw err;
      }

      const markdown = renderSummaryMarkdown(summary);
      const outPath = join(root.uri.fsPath, "dextree-summary.md");
      const outUri = vscode.Uri.file(outPath);
      const encoded = new TextEncoder().encode(markdown);

      try {
        await vscode.workspace.fs.writeFile(outUri, encoded);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await vscode.window.showErrorMessage("Dextree: Failed to write summary: " + reason);
        return;
      }

      await vscode.window.showTextDocument(outUri);
    } finally {
      isExporting = false;
    }
  };
}
