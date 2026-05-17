import { createIndexer, type Indexer } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";

import { resolveCacheIdentity } from "./cache/resolveCacheIdentity.js";
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
  let workspaceCacheStatus: "missing" | "empty" | "ready" | "invalid" = "missing";
  let hasShownUnreadableCacheWarning = false;

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

  const refreshWorkspaceCacheStatus = async (): Promise<void> => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspaceRoot === undefined) {
      workspaceCacheStatus = "missing";
      return;
    }

    try {
      const indexer = await getIndexer();
      const identity = await resolveCacheIdentity({ workspaceRoot });
      const validation = await indexer.validateWorkspaceCache(identity);
      workspaceCacheStatus = validation.status;

      if (validation.status === "invalid" && validation.reason === "unreadable") {
        if (!hasShownUnreadableCacheWarning) {
          hasShownUnreadableCacheWarning = true;
          await vscode.window.showWarningMessage(
            "Dextree: Persisted cache could not be read. Showing fallback state.",
          );
        }
      } else {
        hasShownUnreadableCacheWarning = false;
      }
    } catch {
      workspaceCacheStatus = "invalid";
    }
  };

  const canHydrateCache = (): boolean => workspaceCacheStatus === "ready";

  const pushCurrentGraph = async (): Promise<void> => {
    if (!WebviewPanelManager.isOpen()) {
      return;
    }

    if (!canHydrateCache()) {
      WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspaceRoot === undefined) {
      WebviewPanelManager.pushGraph({ nodes: [], edges: [] });
      return;
    }

    const indexer = await getIndexer();
    const graph = await indexer.getWorkspaceSubgraph(workspaceRoot);
    WebviewPanelManager.pushGraph(graph);
  };

  const refreshGraphIfOpen = (): void => {
    if (!WebviewPanelManager.isOpen()) {
      return;
    }

    void (async () => {
      try {
        await pushCurrentGraph();
      } catch {
        // Non-critical — panel will still show previous state
      }
    })();
  };

  const symbolsProvider = new SymbolsTreeProvider(
    () => activeIndexer,
    logger,
    () => vscode.workspace.workspaceFolders?.[0]?.uri,
    canHydrateCache,
  );

  const refreshViewsAfterIndex = (): void => {
    void (async () => {
      await refreshWorkspaceCacheStatus();
      symbolsProvider.refresh();
      refreshGraphIfOpen();
    })();
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
        onIndexed: refreshViewsAfterIndex,
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.indexWorkspace",
      createIndexWorkspaceCommand({
        logger,
        getIndexer,
        onIndexed: refreshViewsAfterIndex,
      }),
    ),
  );

  const treeView = vscode.window.createTreeView("dextree.symbolsView", {
    treeDataProvider: symbolsProvider,
  });

  context.subscriptions.push(treeView);

  void (async () => {
    await refreshWorkspaceCacheStatus();
    symbolsProvider.refresh();
    refreshGraphIfOpen();
  })();
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
