import { createIndexer, type Indexer } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";

import { createIndexFileCommand } from "./commands/indexFile.js";
import { createIndexWorkspaceCommand } from "./commands/indexWorkspace.js";
import { registerOpenGraphViewCommand } from "./commands/openGraphView.js";
import { createLogger, type Logger } from "./logger.js";
import { SymbolsTreeProvider } from "./tree/SymbolsTreeProvider.js";
import { WebviewPanelManager } from "./webview/panel.js";

let activeIndexer: Indexer | null = null;
let activeLogger: Logger | null = null;

interface ActivationContext {
  subscriptions: { dispose(): void }[];
  storageUri: { fsPath: string } | undefined;
  extensionUri: { fsPath: string };
}

export async function activate(context: ActivationContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Dextree");
  const logger = createLogger(outputChannel);
  activeLogger = logger;

  logger.debug("activated");

  let indexerPromise: Promise<Indexer> | null = null;

  const getIndexer = async (): Promise<Indexer> => {
    if (indexerPromise !== null) {
      return indexerPromise;
    }

    const storageUri = context.storageUri;

    if (storageUri === undefined) {
      throw new Error("Dextree storage is unavailable for this workspace.");
    }

    indexerPromise = (async () => {
      await vscode.workspace.fs.createDirectory(storageUri as unknown as vscode.Uri);

      const indexer = createIndexer(
        join(storageUri.fsPath, "dextree.db"),
        join(context.extensionUri.fsPath, "dist"),
      );

      activeIndexer = indexer;
      await indexer.initialize();
      return indexer;
    })();

    return indexerPromise;
  };

  context.subscriptions.push(
    outputChannel,
    registerOpenGraphViewCommand(context as unknown as vscode.ExtensionContext, getIndexer),
    vscode.commands.registerCommand(
      "dextree.indexFile",
      createIndexFileCommand({
        context,
        logger,
        getIndexer,
        onIndexed: () => {
          symbolsProvider.refresh();
          if (WebviewPanelManager.isOpen()) {
            // Fire-and-forget: push updated symbols to panel after index
            void (async () => {
              try {
                const indexer = await getIndexer();
                const storedFiles = await indexer.getAllFiles();
                const filesWithSymbols = await Promise.all(
                  storedFiles.map(async (file) => {
                    const symbols = await indexer.getSymbols(file.relativePath);
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
              } catch {
                // Non-critical — panel will still show previous state
              }
            })();
          }
        },
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.indexWorkspace",
      createIndexWorkspaceCommand({
        logger,
        getIndexer,
        onIndexed: () => symbolsProvider.refresh(),
      }),
    ),
  );

  const symbolsProvider = new SymbolsTreeProvider(
    () => activeIndexer,
    logger,
    () => vscode.workspace.workspaceFolders?.[0]?.uri,
  );

  const treeView = vscode.window.createTreeView("dextree.symbolsView", {
    treeDataProvider: symbolsProvider,
  });

  context.subscriptions.push(treeView);
}

export async function deactivate(): Promise<void> {
  if (activeIndexer !== null) {
    await activeIndexer.dispose();
    activeIndexer = null;
  }

  if (activeLogger !== null) {
    activeLogger.dispose();
    activeLogger = null;
  }
}
