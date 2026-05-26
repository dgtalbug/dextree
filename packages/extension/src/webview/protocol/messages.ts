/**
 * Dextree Webview Message Protocol — S3 Hello Webview
 *
 * Shared between the extension host (panel.ts) and the webview React app (App.tsx).
 *
 * Extension host → Webview: HostToWebviewMessage
 * Webview → Extension host: WebviewToHostMessage
 */

import type { GraphEdge, GraphNode } from "@dextree/core";
import type { MermaidPreviewOptions, MermaidPreviewResult } from "@dextree/exporters";

// ---------------------------------------------------------------------------
// Shared entity types
// ---------------------------------------------------------------------------

/**
 * Display record for one card in the Workspaces page. Sent in the
 * `workspaceList` payload from host → webview (slice 024).
 */
export interface IndexedWorkspaceRecord {
  workspaceRoot: string;
  name: string;
  indexedFileCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  lastIndexedAt: string | null;
  frameworks: readonly string[];
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Extension Host → Webview messages
// ---------------------------------------------------------------------------

/**
 * Pushed by the extension host on panel open and after each index completion
 * while the panel is open (FR-004, FR-009).
 */
export interface GraphMessage {
  type: "graph";
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Sorted, deduplicated set of edge kinds present in this workspace graph (US3). */
  presentEdgeKinds?: readonly string[];
  /** Directory basename of the currently displayed workspace (slice 024). */
  workspaceName?: string;
  /** Detected framework names for the displayed workspace (may be empty, slice 024). */
  workspaceFrameworks?: readonly string[];
}

export type IndexingPhase = "starting" | "progress" | "finished";

export type IndexingStatus = "starting" | "indexing" | "failed" | "completed" | "cancelled";

export interface IndexingMessage {
  type: "indexing";
  phase: IndexingPhase;
  current: number;
  total: number;
  fileName: string | null;
  failed: number;
  cancelled: boolean;
  status: IndexingStatus;
}

/** Sent in response to `requestWorkspaceList`. Carries every indexed workspace (slice 024). */
export interface WorkspaceListMessage {
  type: "workspaceList";
  workspaces: IndexedWorkspaceRecord[];
}

/**
 * Sent by the extension host when the Mermaid preview should open or refresh
 * (slice 029). `preview.status === "ok"` carries source + title for the
 * webview to render; non-ok statuses are fail-closed and the webview
 * surfaces the reason without rendering anything.
 */
export interface MermaidPreviewMessage {
  type: "mermaidPreview";
  preview: MermaidPreviewResult;
}

/** Union of all messages the extension host can send to the webview. */
export type HostToWebviewMessage =
  | GraphMessage
  | IndexingMessage
  | WorkspaceListMessage
  | MermaidPreviewMessage;

// ---------------------------------------------------------------------------
// Webview → Extension Host messages
// ---------------------------------------------------------------------------

/**
 * Sent when the user clicks a symbol entry in the webview (FR-007).
 * All fields are validated by the extension host before acting (FR-013).
 */
export interface NavigateMessage {
  type: "navigate";
  /** Absolute path to the source file. Must be within the workspace root. */
  filePath: string;
  /** 0-based line number. Maps to VS Code Range(line, 0, line, 0). */
  line: number;
}

/**
 * Sent by the webview once the React app has mounted and its message listener
 * is registered. The extension host re-pushes any cached symbols on receipt.
 */
export interface ReadyMessage {
  type: "ready";
}

export type GraphCommandId =
  | "index-workspace"
  | "cancel-indexing"
  | "clear-workspace"
  | "clear-all"
  | "export-mermaid";

export interface CommandMessage {
  type: "command";
  command: GraphCommandId;
}

/** Sent when the user clicks the toolbar workspace button (slice 024). */
export interface RequestWorkspaceListMessage {
  type: "requestWorkspaceList";
}

/** Sent when the user clicks a workspace card or picks one from the command palette (slice 024). */
export interface SwitchWorkspaceMessage {
  type: "switchWorkspace";
  workspaceRoot: string;
}

/**
 * Sent by the preview tab when an inline control change should re-request a
 * preview from the host (slice 029, US2 in PR-B). The webview resolves
 * `options.theme` from the active VS Code theme before sending.
 */
export interface RequestMermaidPreviewMessage {
  type: "requestMermaidPreview";
  options: MermaidPreviewOptions;
}

/**
 * Sent by the preview tab when the user picks a file-backed save action
 * (slice 029, US3 in PR-C). For `mmd` / `svg`, `content` is UTF-8 text.
 * For `png`, `content` is a `data:image/png;base64,...` payload that the
 * host decodes before writing.
 */
export interface SaveMermaidPreviewMessage {
  type: "saveMermaidPreview";
  format: "mmd" | "svg" | "png";
  suggestedName: string;
  content: string;
}

/**
 * Diagnostic-only bridge for webview-side `console.log` / `console.error`
 * etc. The webview installs a console interceptor in `main.tsx` and posts
 * the formatted string back to the host, which appends it to the Dextree
 * output channel. Lets developers see what the React app is doing without
 * opening the webview devtools.
 */
export interface WebviewLogMessage {
  type: "webviewLog";
  level: "log" | "debug" | "info" | "warn" | "error";
  message: string;
}

/** Union of all messages the webview can send to the extension host. */
export type WebviewToHostMessage =
  | NavigateMessage
  | ReadyMessage
  | CommandMessage
  | RequestWorkspaceListMessage
  | SwitchWorkspaceMessage
  | RequestMermaidPreviewMessage
  | SaveMermaidPreviewMessage
  | WebviewLogMessage;

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/** Narrows an unknown value to HostToWebviewMessage. */
export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg["type"] === "graph" ||
    msg["type"] === "indexing" ||
    msg["type"] === "workspaceList" ||
    msg["type"] === "mermaidPreview"
  );
}

/** Narrows an unknown value to WebviewToHostMessage. */
export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg["type"] === "navigate" ||
    msg["type"] === "ready" ||
    msg["type"] === "command" ||
    msg["type"] === "requestWorkspaceList" ||
    msg["type"] === "switchWorkspace" ||
    msg["type"] === "requestMermaidPreview" ||
    msg["type"] === "saveMermaidPreview" ||
    msg["type"] === "webviewLog"
  );
}
