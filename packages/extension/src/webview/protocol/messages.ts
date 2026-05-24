/**
 * Dextree Webview Message Protocol — S3 Hello Webview
 *
 * Shared between the extension host (panel.ts) and the webview React app (App.tsx).
 *
 * Extension host → Webview: HostToWebviewMessage
 * Webview → Extension host: WebviewToHostMessage
 */

import type { GraphEdge, GraphNode } from "@dextree/core";

// ---------------------------------------------------------------------------
// Shared entity types
// ---------------------------------------------------------------------------

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

/** Union of all messages the extension host can send to the webview. */
export type HostToWebviewMessage = GraphMessage | IndexingMessage;

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

/** Union of all messages the webview can send to the extension host. */
export type WebviewToHostMessage = NavigateMessage | ReadyMessage | CommandMessage;

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/** Narrows an unknown value to HostToWebviewMessage. */
export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return msg["type"] === "graph" || msg["type"] === "indexing";
}

/** Narrows an unknown value to WebviewToHostMessage. */
export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return msg["type"] === "navigate" || msg["type"] === "ready" || msg["type"] === "command";
}
