import { createIndexer, readWorkspaceGraph, type Indexer } from "@dextree/core";
import { generateMermaidPreview, type MermaidPreviewResult } from "@dextree/exporters";
import { basename, join } from "node:path";
import * as vscode from "vscode";

import { resolveCacheIdentity } from "./cache/resolveCacheIdentity.js";
import {
  listIndexedWorkspaces,
  readWorkspaceRegistry,
  registerWorkspace,
} from "./cache/workspaceRegistry.js";
import { createSwitchWorkspaceCommand } from "./commands/switchWorkspace.js";
import {
  createClearAllIndexCommand,
  createClearWorkspaceIndexCommand,
} from "./commands/clearIndex.js";
import { createExportSessionSummaryCommand } from "./commands/exportSessionSummary.js";
import {
  createExportMermaidCommand,
  executeInferredMermaidExport,
  startInferredMermaidExport,
} from "./commands/exportMermaid.js";
import {
  createExportCurrentViewCommand,
  createExportTraceCommand,
} from "./commands/exportCurrentView.js";
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
  globalStorageUri?: { fsPath: string };
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
    WebviewPanelManager.pushGraph({
      ...graph,
      presentEdgeKinds,
      workspaceName: basename(workspaceRoot),
      workspaceFrameworks: graph.frameworks.map((fw) => fw.name),
    });
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

  const handleSwitchWorkspace = async (targetWorkspaceRoot: string): Promise<void> => {
    const globalStoragePath = context.globalStorageUri?.fsPath;
    if (globalStoragePath === undefined) {
      await vscode.window.showErrorMessage(
        "Dextree: Workspace registry unavailable for this VS Code session.",
      );
      return;
    }

    const registry = await readWorkspaceRegistry(globalStoragePath);
    const entry = registry.entries.find((e) => e.workspaceRoot === targetWorkspaceRoot);
    if (entry === undefined) {
      await vscode.window.showErrorMessage(
        `Dextree: Workspace ${basename(targetWorkspaceRoot)} is not in the index registry.`,
      );
      return;
    }

    const result = await readWorkspaceGraph(entry.dbPath, targetWorkspaceRoot);
    if (result === null) {
      await vscode.window.showErrorMessage(
        `Could not open workspace ${basename(targetWorkspaceRoot)}. The index may be missing or corrupt.`,
      );
      return;
    }

    WebviewPanelManager.create(context as unknown as vscode.ExtensionContext);
    WebviewPanelManager.pushGraph({
      ...result.subgraph,
      presentEdgeKinds: result.presentEdgeKinds,
      workspaceName: basename(targetWorkspaceRoot),
      workspaceFrameworks: result.subgraph.frameworks.map((fw) => fw.name),
    });
  };

  WebviewPanelManager.setLogger(logger);
  WebviewPanelManager.setWorkspaceHandlers({
    onRequestWorkspaceList: async () => {
      const globalStoragePath = context.globalStorageUri?.fsPath;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (globalStoragePath === undefined || workspaceRoot === undefined) {
        return [];
      }
      return listIndexedWorkspaces(globalStoragePath, workspaceRoot);
    },
    onSwitchWorkspace: handleSwitchWorkspace,
  });

  // Slice 029 PR-B — wire inline-control rerenders. The webview posts
  // `requestMermaidPreview` whenever the user changes a control; the handler
  // pulls the latest indexed subgraph for the active workspace and runs it
  // through the same preview router the `dextree.exportMermaid` command uses.
  WebviewPanelManager.setMermaidPreviewHandler(async (options) => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot === undefined) {
      return {
        status: "unsupported",
        options,
        reason: "Open a workspace folder before previewing a Mermaid diagram.",
      };
    }
    const indexer = await getIndexer();
    const subgraph = await indexer.getWorkspaceSubgraph(workspaceRoot);
    return generateMermaidPreview(subgraph, options);
  });

  const recordSuccessfulIndex = async (): Promise<void> => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const storageUri = context.storageUri;
    const globalStoragePath = context.globalStorageUri?.fsPath;

    if (
      workspaceRoot === undefined ||
      storageUri === undefined ||
      globalStoragePath === undefined
    ) {
      return;
    }

    try {
      await registerWorkspace(
        globalStoragePath,
        workspaceRoot,
        join(storageUri.fsPath, "dextree.db"),
      );
    } catch {
      // Registry is best-effort — failure must not block indexing or graph push.
    }
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

  const openPreview = (preview: MermaidPreviewResult): void => {
    WebviewPanelManager.create(context as unknown as vscode.ExtensionContext);
    WebviewPanelManager.pushMermaidPreview(preview);
  };

  async function pickSymbol(): Promise<{ id: string; filePath: string } | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot === undefined) return undefined;
    const indexer = await getIndexer();
    const files = await indexer.getAllFiles();
    const symbols: { id: string; name: string; filePath: string }[] = [];
    for (const file of files) {
      const fileSymbols = await indexer.getSymbols(file.relativePath);
      for (const s of fileSymbols) {
        symbols.push({
          id: s.id,
          name: `${s.name} (${s.kind}) — ${file.relativePath}`,
          filePath: file.relativePath,
        });
      }
    }
    const picked = await vscode.window.showQuickPick(
      symbols.map((s) => ({ label: s.name, value: s })),
      { placeHolder: "Pick a symbol to export" },
    );
    return picked?.value;
  }

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
          // Refresh cache status and push the completed graph BEFORE sending
          // "finished" to the webview. This prevents an empty-state flash where
          // the overlay clears before the graph message has arrived.
          void (async () => {
            await refreshWorkspaceCacheStatus();
            symbolsProvider.refresh();
            if (update.status === "completed") {
              await recordSuccessfulIndex();
            }
            if (WebviewPanelManager.isOpen()) {
              try {
                await pushCurrentGraph();
              } catch {
                // Non-critical — panel will still clear the overlay
              }
            }
            pushIndexing("finished", update);
            void watcher?.drainQueue();
          })();
        },
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
    vscode.commands.registerCommand(
      "dextree.exportMermaid",
      createExportMermaidCommand({
        getIndexer,
        openMermaidPreview: (preview) => {
          WebviewPanelManager.create(context as unknown as vscode.ExtensionContext);
          WebviewPanelManager.pushMermaidPreview(preview);
        },
      }),
    ),
    // Slice 030 — selection-aware and focused Mermaid export commands.
    // All commands delegate to the same inferred-export path so behavior
    // stays consistent and fail-closed.
    vscode.commands.registerCommand("dextree.exportCallers", async () => {
      const symbol = await pickSymbol();
      if (symbol === undefined) return;
      await startInferredMermaidExport({ getIndexer, openMermaidPreview: openPreview }, "callers", {
        kind: "symbol",
        symbolId: symbol.id,
        filePath: symbol.filePath,
      });
    }),
    vscode.commands.registerCommand("dextree.exportCallees", async () => {
      const symbol = await pickSymbol();
      if (symbol === undefined) return;
      await startInferredMermaidExport({ getIndexer, openMermaidPreview: openPreview }, "callees", {
        kind: "symbol",
        symbolId: symbol.id,
        filePath: symbol.filePath,
      });
    }),
    vscode.commands.registerCommand("dextree.exportClassHierarchy", async () => {
      const symbol = await pickSymbol();
      if (symbol === undefined) return;
      await startInferredMermaidExport(
        { getIndexer, openMermaidPreview: openPreview },
        "class-hierarchy",
        { kind: "symbol", symbolId: symbol.id, filePath: symbol.filePath },
      );
    }),
    vscode.commands.registerCommand("dextree.exportPackage", async () => {
      await startInferredMermaidExport({ getIndexer, openMermaidPreview: openPreview }, "package", {
        kind: "folder",
        relativePath: ".",
      });
    }),
    vscode.commands.registerCommand(
      "dextree.exportTrace",
      createExportTraceCommand({
        exportInferred: async (inferred) => {
          await executeInferredMermaidExport(
            { getIndexer, openMermaidPreview: openPreview },
            inferred,
          );
        },
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.exportCurrentView",
      createExportCurrentViewCommand({
        exportInferred: async (inferred) => {
          await executeInferredMermaidExport(
            { getIndexer, openMermaidPreview: openPreview },
            inferred,
          );
        },
      }),
    ),
    vscode.commands.registerCommand(
      "dextree.switchWorkspace",
      createSwitchWorkspaceCommand({
        getGlobalStoragePath: () => context.globalStorageUri?.fsPath,
        getActiveWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        switchWorkspace: handleSwitchWorkspace,
      }),
    ),
  );

  const treeView = vscode.window.createTreeView("dextree.symbolsView", {
    treeDataProvider: symbolsProvider,
  });

  context.subscriptions.push(treeView);

  // Auto-reveal the graph panel whenever the Dextree sidebar becomes visible
  // so the two surfaces stay in sync (sidebar tree + editor graph panel).
  context.subscriptions.push(
    treeView.onDidChangeVisibility(({ visible }) => {
      if (visible) {
        void vscode.commands.executeCommand("dextree.openGraphView");
      }
    }),
  );

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
    if (canHydrateCache()) {
      await recordSuccessfulIndex();
    }
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
