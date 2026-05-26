import type { MermaidPreviewOptions, MermaidPreviewResult } from "@dextree/exporters";
import * as vscode from "vscode";
import type { Logger } from "../logger.js";
import { getWebviewContent } from "./html.js";
import type {
  CommandMessage,
  GraphMessage,
  HostToWebviewMessage,
  IndexedWorkspaceRecord,
  IndexingMessage,
  MermaidPreviewMessage,
  WorkspaceListMessage,
} from "./protocol/messages.js";
import { validateNavigateMessage } from "./validate.js";

/**
 * Host-side resolver for `requestMermaidPreview` messages. Wired in
 * `extension.ts` to read the latest indexed workspace subgraph and call
 * `generateMermaidPreview` against the requested options. Returning a value
 * directly or via Promise is both acceptable so the wiring can stay sync
 * during tests and async in production.
 */
export type MermaidPreviewHandler = (
  options: MermaidPreviewOptions,
) => Promise<MermaidPreviewResult> | MermaidPreviewResult;

// Whitelisted webview→host commands. Only these command IDs are allowed.
const WEBVIEW_COMMANDS: Record<string, string> = {
  "index-workspace": "dextree.indexWorkspace",
  "cancel-indexing": "dextree.cancelWorkspaceIndexing",
  "clear-workspace": "dextree.clearWorkspaceIndex",
  "clear-all": "dextree.clearAllIndex",
  "export-mermaid": "dextree.exportMermaid",
};

// Module-level singleton — exactly one panel per extension session.
let currentPanel: vscode.WebviewPanel | undefined;
// Last graph pushed — re-sent when webview posts 'ready' (handles race condition).
let cachedGraph: GraphMessage | undefined;
let cachedIndexing: IndexingMessage | undefined;
// Last Mermaid preview pushed — same race-handling rationale as cachedGraph.
// Without caching, the first preview message sent immediately after
// `WebviewPanelManager.create()` is dropped because the webview hasn't yet
// posted `ready` and `postMessage` is a no-op until then. Cache lets the
// `ready` handler replay it.
let cachedMermaidPreview: MermaidPreviewMessage | undefined;
let isWebviewReady = false;

// Slice 024 — injected by extension.ts so panel.ts stays decoupled from the
// workspace registry / cache layer. Both handlers return without effect when
// undefined (the webview just sees no response).
let listIndexedWorkspacesHandler: (() => Promise<IndexedWorkspaceRecord[]>) | undefined;
let switchWorkspaceHandler: ((workspaceRoot: string) => Promise<void>) | undefined;

// Slice 029 PR-B — injected by extension.ts so panel.ts stays decoupled from
// the indexer. Resolves a `requestMermaidPreview` from the webview against the
// current workspace subgraph. Undefined means no handler is registered yet, in
// which case incoming requests are silently dropped (useful in unit tests and
// during activation before wiring completes).
let mermaidPreviewHandler: MermaidPreviewHandler | undefined;

type MermaidPreviewSaveFormat = "mmd" | "svg" | "png";

interface ParsedSaveMermaidPreviewMessage {
  format: MermaidPreviewSaveFormat;
  suggestedName: string;
  bytes: Uint8Array;
}

const VALID_DIAGRAMS = new Set(["flowchart", "classDiagram", "sequenceDiagram"]);
const VALID_GRANULARITIES = new Set(["package", "file", "symbol"]);
const VALID_DIRECTIONS = new Set(["auto", "TB", "LR", "BT", "RL"]);
const VALID_THEMES = new Set(["light", "dark"]);
const VALID_SCOPE_KINDS = new Set(["workspace", "file", "symbol-callers", "symbol-callees"]);

function isMermaidPreviewOptionsLike(value: unknown): value is MermaidPreviewOptions {
  if (typeof value !== "object" || value === null) return false;
  const opts = value as Record<string, unknown>;

  const diagram = opts["diagram"];
  const granularity = opts["granularity"];
  const direction = opts["direction"];
  const theme = opts["theme"];
  const scope = opts["scope"];

  if (
    typeof diagram !== "string" ||
    !VALID_DIAGRAMS.has(diagram) ||
    typeof granularity !== "string" ||
    !VALID_GRANULARITIES.has(granularity) ||
    typeof direction !== "string" ||
    !VALID_DIRECTIONS.has(direction) ||
    typeof theme !== "string" ||
    !VALID_THEMES.has(theme) ||
    typeof scope !== "object" ||
    scope === null
  ) {
    return false;
  }

  const scopeRecord = scope as Record<string, unknown>;
  const kind = scopeRecord["kind"];
  if (typeof kind !== "string" || !VALID_SCOPE_KINDS.has(kind)) {
    return false;
  }

  return true;
}

function parseSaveMermaidPreviewMessage(
  value: Record<string, unknown>,
): ParsedSaveMermaidPreviewMessage | null {
  const format = value["format"];
  const suggestedName = value["suggestedName"];
  const content = value["content"];

  if (
    (format !== "mmd" && format !== "svg" && format !== "png") ||
    typeof suggestedName !== "string" ||
    suggestedName.length === 0 ||
    typeof content !== "string"
  ) {
    return null;
  }

  if (format === "png") {
    const bytes = decodePngDataUrl(content);
    if (bytes === null) {
      return null;
    }
    return { format, suggestedName, bytes };
  }

  return {
    format,
    suggestedName,
    bytes: new TextEncoder().encode(content),
  };
}

function decodePngDataUrl(content: string): Uint8Array | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(content);
  if (match === null) {
    return null;
  }

  const base64 = match[1];
  if (base64 === undefined || base64.length === 0 || base64.length % 4 !== 0) {
    return null;
  }

  return Uint8Array.from(Buffer.from(base64, "base64"));
}

async function saveMermaidPreview(message: ParsedSaveMermaidPreviewMessage): Promise<void> {
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri =
    workspaceUri !== undefined
      ? vscode.Uri.joinPath(workspaceUri, message.suggestedName)
      : vscode.Uri.file(message.suggestedName);

  const targetUri = await vscode.window.showSaveDialog({
    defaultUri,
    saveLabel: "Save Mermaid Preview",
  });

  if (targetUri === undefined) {
    return;
  }

  await vscode.workspace.fs.writeFile(targetUri, message.bytes);
}

// Optional logger injected by extension.ts. Used to surface webview-side
// `console.*` calls bridged through the `webviewLog` protocol message.
let injectedLogger: Logger | undefined;

function postCachedState(): void {
  if (currentPanel === undefined || !isWebviewReady) {
    return;
  }

  const messages: HostToWebviewMessage[] = [];

  if (cachedGraph !== undefined) {
    messages.push(cachedGraph);
  }

  if (cachedIndexing !== undefined) {
    messages.push(cachedIndexing);
  }

  if (cachedMermaidPreview !== undefined) {
    messages.push(cachedMermaidPreview);
  }

  for (const message of messages) {
    void currentPanel.webview.postMessage(message);
  }
}

function postMessage(message: HostToWebviewMessage): void {
  if (currentPanel === undefined || !isWebviewReady) {
    return;
  }

  void currentPanel.webview.postMessage(message);
}

/**
 * Manages the Dextree Graph View webview panel (FR-001 through FR-013).
 *
 * Use `WebviewPanelManager.create()` to open or reveal the panel.
 * Use `WebviewPanelManager.pushGraph()` to push an updated graph payload.
 */
export const WebviewPanelManager = {
  /**
   * Creates a new webview panel, or reveals the existing one if already open.
   * On creation, immediately posts the current symbol list (FR-004).
   */
  create(context: vscode.ExtensionContext): void {
    if (currentPanel !== undefined) {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    currentPanel = vscode.window.createWebviewPanel(
      "dextree.graphView",
      "Dextree Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
        retainContextWhenHidden: true,
      },
    );

    currentPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "dextree.svg");
    isWebviewReady = false;

    // Navigation messages from the webview (FR-007, FR-013)
    currentPanel.webview.onDidReceiveMessage(
      (msg: unknown) => {
        if (typeof msg !== "object" || msg === null) return;
        const record = msg as Record<string, unknown>;

        // Webview signals it's ready — re-push cached graph to avoid race condition
        if (record["type"] === "ready") {
          isWebviewReady = true;
          postCachedState();
          return;
        }

        // Webview dispatches a whitelisted VS Code command
        if (record["type"] === "command") {
          const cmdMsg = msg as CommandMessage;
          const vsCommand = WEBVIEW_COMMANDS[cmdMsg.command];
          if (vsCommand !== undefined) {
            void vscode.commands.executeCommand(vsCommand);
          }
          return;
        }

        // Slice 024 — webview asks for the list of indexed workspaces
        if (record["type"] === "requestWorkspaceList") {
          const provider = listIndexedWorkspacesHandler;
          if (provider !== undefined) {
            void provider()
              .then((workspaces) => {
                const reply: WorkspaceListMessage = {
                  type: "workspaceList",
                  workspaces,
                };
                postMessage(reply);
              })
              .catch(() => {
                postMessage({ type: "workspaceList", workspaces: [] });
              });
          }
          return;
        }

        // Slice 024 — webview asks to switch to a different workspace
        if (record["type"] === "switchWorkspace") {
          const target = record["workspaceRoot"];
          const handler = switchWorkspaceHandler;
          if (handler !== undefined && typeof target === "string" && target.length > 0) {
            void handler(target).catch(() => {
              // Errors are surfaced as VS Code notifications inside the handler.
            });
          }
          return;
        }

        // Slice 029 PR-B — webview asks the host to build a fresh preview from
        // the latest indexed graph and the current inline-control selection.
        // Any throw from the handler is converted into a fail-closed
        // `mermaidPreview` reply so the preview tab never silently hangs in
        // "rendering" — `pushMermaidPreview` updates the cached message too,
        // so a panel re-open after a failed request shows the failure reason
        // instead of the previous successful preview.
        if (record["type"] === "requestMermaidPreview") {
          const handler = mermaidPreviewHandler;
          const options = record["options"];
          if (handler === undefined || !isMermaidPreviewOptionsLike(options)) {
            return;
          }
          void Promise.resolve()
            .then(() => handler(options))
            .then((preview) => {
              WebviewPanelManager.pushMermaidPreview(preview);
            })
            .catch((err: unknown) => {
              const reason = err instanceof Error ? err.message : String(err);
              WebviewPanelManager.pushMermaidPreview({
                status: "unsupported",
                options,
                reason,
              });
            });
          return;
        }

        if (record["type"] === "saveMermaidPreview") {
          const saveRequest = parseSaveMermaidPreviewMessage(record);
          if (saveRequest === null) {
            return;
          }

          void saveMermaidPreview(saveRequest).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`Dextree: Failed to save preview — ${message}`);
          });
          return;
        }

        // Slice 030 US3 — webview requests a current-view Mermaid export.
        if (record["type"] === "exportCurrentView") {
          const viewId = record["viewId"];
          if (typeof viewId === "string" && viewId.length > 0) {
            void vscode.commands.executeCommand("dextree.exportCurrentView");
          }
          return;
        }

        // Diagnostic — webview-side console.* / error events bridged here.
        // Routes through the same logger the rest of the extension uses, so
        // everything lands in the Dextree output channel and follows the
        // user's preferred logging configuration.
        if (record["type"] === "webviewLog") {
          const level = typeof record["level"] === "string" ? record["level"] : "log";
          const message =
            typeof record["message"] === "string" ? record["message"] : "<non-string log payload>";
          if (level === "error") {
            injectedLogger?.error(`[webview] ${message}`);
          } else {
            injectedLogger?.debug(`[webview:${level}] ${message}`);
          }
          return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const validated = validateNavigateMessage(msg, workspaceRoot);
        if (validated === null) {
          // Silent ignore per FR-013 — invalid or untrusted message
          return;
        }
        void navigateToSymbol(validated.filePath, validated.line);
      },
      undefined,
      context.subscriptions,
    );

    // Register handlers before loading the webview so an eager `ready` message
    // from the client cannot race ahead of the host listener.
    currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri);

    // Clean up module reference when panel is closed (FR-005)
    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
        cachedGraph = undefined;
        cachedIndexing = undefined;
        cachedMermaidPreview = undefined;
        isWebviewReady = false;
        // Preview handler is intentionally kept across panel lifecycle so a
        // re-opened panel inherits the same indexer wiring without requiring
        // extension.ts to re-inject on every create() call.
      },
      undefined,
      context.subscriptions,
    );

    context.subscriptions.push(currentPanel);
  },

  /**
   * Pushes an updated graph payload to the open webview panel.
   * No-op if no panel is currently open.
   */
  pushGraph(graph: Omit<GraphMessage, "type">): void {
    cachedGraph = {
      type: "graph",
      nodes: graph.nodes,
      edges: graph.edges,
      ...(graph.presentEdgeKinds !== undefined && { presentEdgeKinds: graph.presentEdgeKinds }),
      ...(graph.workspaceName !== undefined && { workspaceName: graph.workspaceName }),
      ...(graph.workspaceFrameworks !== undefined && {
        workspaceFrameworks: graph.workspaceFrameworks,
      }),
    };
    postCachedState();
  },

  /**
   * Slice 029 — push a Mermaid preview result to the open webview. The
   * webview reacts by switching to the mermaid-preview scene and rendering
   * the source/SVG pair (or fail-closed reason for non-ok statuses).
   *
   * Caches the message so `postCachedState` can replay it after the webview
   * posts `ready`. Without caching the first preview opened immediately after
   * `WebviewPanelManager.create()` is dropped because `postMessage` is a
   * no-op until `isWebviewReady` flips true. Same race rationale as
   * `pushGraph` and `pushIndexing`.
   *
   * Subsequent inline-control changes (US2 / PR-B) will overwrite the cache
   * with the new result so reopens always show the most recent preview.
   */
  pushMermaidPreview(preview: MermaidPreviewResult): void {
    const message: MermaidPreviewMessage = { type: "mermaidPreview", preview };
    cachedMermaidPreview = message;
    postCachedState();
  },

  pushIndexing(indexing: Omit<IndexingMessage, "type">): void {
    const message: IndexingMessage = {
      type: "indexing",
      ...indexing,
    };

    if (message.phase === "finished") {
      cachedIndexing = undefined;
      postMessage(message);
      return;
    }

    cachedIndexing = message;
    postCachedState();
  },

  /**
   * Returns true if a panel is currently open (visible or retained in background).
   */
  isOpen(): boolean {
    return currentPanel !== undefined;
  },

  /**
   * Slice 024 — register host-side handlers for workspace switcher messages.
   * Called once during extension activation. Subsequent calls overwrite the
   * stored handlers (useful for tests).
   */
  /**
   * Inject a logger so the diagnostic `webviewLog` bridge can write to the
   * Dextree output channel. Optional — when unset (e.g. unit tests) the
   * bridge silently drops the bridged messages.
   */
  setLogger(logger: Logger): void {
    injectedLogger = logger;
  },

  setWorkspaceHandlers(handlers: {
    onRequestWorkspaceList?: () => Promise<IndexedWorkspaceRecord[]>;
    onSwitchWorkspace?: (workspaceRoot: string) => Promise<void>;
  }): void {
    listIndexedWorkspacesHandler = handlers.onRequestWorkspaceList;
    switchWorkspaceHandler = handlers.onSwitchWorkspace;
  },

  /**
   * Slice 029 PR-B — register the host-side resolver for inline-control
   * preview rerenders. Wired once during extension activation against the
   * shared indexer; subsequent calls overwrite. Pass `undefined` to clear
   * (used by tests between cases).
   */
  setMermaidPreviewHandler(handler: MermaidPreviewHandler | undefined): void {
    mermaidPreviewHandler = handler;
  },
};

async function navigateToSymbol(filePath: string, line: number): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(Math.max(line - 1, 0), 0);
    await vscode.window.showTextDocument(doc, {
      selection: new vscode.Selection(position, position),
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
  } catch {
    await vscode.window.showErrorMessage(`Dextree: Could not open file ${filePath}`);
  }
}
