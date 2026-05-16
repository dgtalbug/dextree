/**
 * Dextree Webview Message Protocol — S3 Hello Webview
 *
 * Shared between the extension host (panel.ts) and the webview React app (App.tsx).
 *
 * Extension host → Webview: HostToWebviewMessage
 * Webview → Extension host: WebviewToHostMessage
 */

// ---------------------------------------------------------------------------
// Shared entity types
// ---------------------------------------------------------------------------

/** A single indexed symbol as delivered to the webview. */
export interface SymbolEntry {
  /** Display name (e.g. "greet"). */
  name: string;
  /** Symbol kind label (e.g. "function", "variable"). */
  kind: string;
  /** 0-based start line of the symbol definition. */
  startLine: number;
}

/** A file and its indexed symbols as delivered to the webview. */
export interface FileWithSymbols {
  /** Absolute path on disk. Used as the filePath in NavigateMessage. */
  path: string;
  /** Workspace-relative path. Used as the display label in the symbol list. */
  relativePath: string;
  /** All symbols indexed for this file, in storage order. */
  symbols: SymbolEntry[];
}

// ---------------------------------------------------------------------------
// Extension Host → Webview messages
// ---------------------------------------------------------------------------

/**
 * Pushed by the extension host on panel open and after each index completion
 * while the panel is open (FR-004, FR-009).
 */
export interface SymbolsMessage {
  type: "symbols";
  files: FileWithSymbols[];
}

/** Union of all messages the extension host can send to the webview. */
export type HostToWebviewMessage = SymbolsMessage;

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

/** Union of all messages the webview can send to the extension host. */
export type WebviewToHostMessage = NavigateMessage;

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/** Narrows an unknown value to HostToWebviewMessage. */
export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return msg["type"] === "symbols";
}

/** Narrows an unknown value to WebviewToHostMessage. */
export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return msg["type"] === "navigate";
}
