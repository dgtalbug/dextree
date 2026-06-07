import * as vscode from "vscode";

import {
  startInferredMermaidExport,
  type ExportMermaidCommandDependencies,
} from "./exportMermaid.js";

/** A symbol picked by the user (id + file) for a symbol-scoped export shortcut. */
export interface PickedSymbol {
  id: string;
  filePath: string;
}

export interface ExportShortcutDeps extends ExportMermaidCommandDependencies {
  /** Prompt the user to pick a symbol; resolves undefined if cancelled. */
  pickSymbol: () => Promise<PickedSymbol | undefined>;
}

/**
 * The selection-aware Mermaid export shortcuts (callers / callees / class
 * hierarchy / package). Each is a thin `pickSymbol → startInferredMermaidExport`
 * delegation, so they all live in one factory instead of inline in `activate`.
 * Returns the disposables to push onto `context.subscriptions`.
 */
export function createExportShortcutCommands(deps: ExportShortcutDeps): vscode.Disposable[] {
  const exportDeps: ExportMermaidCommandDependencies = {
    getIndexer: deps.getIndexer,
    openMermaidPreview: deps.openMermaidPreview,
  };

  const fromPickedSymbol = (intent: "callers" | "callees" | "class-hierarchy") => async () => {
    const symbol = await deps.pickSymbol();
    if (symbol === undefined) return;
    await startInferredMermaidExport(exportDeps, intent, {
      kind: "symbol",
      symbolId: symbol.id,
      filePath: symbol.filePath,
    });
  };

  return [
    vscode.commands.registerCommand("dextree.exportCallers", fromPickedSymbol("callers")),
    vscode.commands.registerCommand("dextree.exportCallees", fromPickedSymbol("callees")),
    vscode.commands.registerCommand(
      "dextree.exportClassHierarchy",
      fromPickedSymbol("class-hierarchy"),
    ),
    vscode.commands.registerCommand("dextree.exportPackage", async () => {
      await startInferredMermaidExport(exportDeps, "package", {
        kind: "folder",
        relativePath: ".",
      });
    }),
  ];
}
