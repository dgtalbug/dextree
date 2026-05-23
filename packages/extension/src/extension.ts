import { createIndexer, type Indexer } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";

import { resolveCacheIdentity } from "./cache/resolveCacheIdentity.js";
import {
  createClearAllIndexCommand,
  createClearWorkspaceIndexCommand,
} from "./commands/clearIndex.js";
import { createExportSessionSummaryCommand } from "./commands/exportSessionSummary.js";
import { createIndexFileCommand } from "./commands/indexFile.js";
import {
  createIndexWorkspaceCommand,
  isWorkspaceIndexing,
  requestWorkspaceIndexingCancel,
  type IndexWorkspaceProgressUpdate,
} from "./commands/indexWorkspace.js";
import { registerOpenGraphViewCommand } from "./commands/openGraphView.js";
import { createLogger, type Logger } from "./logger.js";
import { SymbolsTreeProvider } from "./tree/SymbolsTreeProvider.js";
import { createWorkspaceWatcher } from "./watcher/workspaceWatcher.js";
import { WebviewPanelManager } from "./webview/panel.js";

let activeIndexer: Indexer | null = null;
let activeLogger: Logger | null = null;
let watcher: (vscode.Disposable & { drainQueue(): Promise<void> }) | null = null;

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
    const presentEdgeKinds = await indexer.getPresentEdgeKinds(workspaceRoot);
    WebviewPanelManager.pushGraph({ ...graph, presentEdgeKinds });
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

  const pushIndexing = (
    phase: "starting" | "progress" | "finished",
    update: IndexWorkspaceProgressUpdate,
  ): void => {
    WebviewPanelManager.pushIndexing({
      phase,
      current: update.current,
      total: update.total,
      fileName: update.fileName,
      failed: update.failed,
      cancelled: update.cancelled,
      status: update.status,
    });
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
        onIndexingStarted: (update) => {
          WebviewPanelManager.create(context as unknown as vscode.ExtensionContext);
          void pushCurrentGraph();
          pushIndexing("starting", update);
        },
        onIndexingProgress: (update) => {
          pushIndexing("progress", update);
        },
        onIndexingFinished: (update) => {
          pushIndexing("finished", update);
          void watcher?.drainQueue();
        },
        onIndexed: refreshViewsAfterIndex,
      }),
    ),
    vscode.commands.registerCommand("dextree.cancelWorkspaceIndexing", () => {
      requestWorkspaceIndexingCancel();
    }),
    vscode.commands.registerCommand(
      "dextree.clearWorkspaceIndex",
      createClearWorkspaceIndexCommand({
        logger,
        getIndexer,
        onCleared: refreshViewsAfterIndex,
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.clearAllIndex",
      createClearAllIndexCommand({
        logger,
        getIndexer,
        onCleared: refreshViewsAfterIndex,
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.exportSessionSummary",
      createExportSessionSummaryCommand({ getIndexer }),
    ),
  );

  const treeView = vscode.window.createTreeView("dextree.symbolsView", {
    treeDataProvider: symbolsProvider,
  });

  context.subscriptions.push(treeView);

  // Register file system watcher if a workspace root is available.
  const watcherRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (watcherRoot !== undefined) {
    watcher = createWorkspaceWatcher({
      workspaceRoot: watcherRoot,
      getIndexer,
      onIndexed: refreshViewsAfterIndex,
      isWorkspaceIndexing,
      logger,
    });
    context.subscriptions.push(watcher);
  }

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

  watcher = null;
}
