import type { NavigateMessage } from "./protocol/messages.js";

/**
 * Validates a raw message object as a NavigateMessage (FR-013).
 *
 * Checks:
 *  - type === "navigate"
 *  - filePath is a non-empty string with an absolute path
 *  - filePath contains no ".." path traversal segments
 *  - filePath starts with workspaceRoot (must be within workspace)
 *  - line is a non-negative safe integer
 *
 * Returns the typed NavigateMessage on success, null otherwise.
 * Failures are silently ignored (DEBUG logging only).
 *
 * @param msg - Raw unknown value received from the webview
 * @param workspaceRoot - Absolute workspace root path. If undefined (e.g. no
 *   workspace folder open), all messages are rejected.
 */
export function validateNavigateMessage(
  msg: unknown,
  workspaceRoot: string | undefined,
): NavigateMessage | null {
  if (workspaceRoot === undefined || workspaceRoot === "") {
    return null;
  }

  if (typeof msg !== "object" || msg === null) {
    return null;
  }

  const m = msg as Record<string, unknown>;

  if (m["type"] !== "navigate") {
    return null;
  }

  const filePath = m["filePath"];
  if (typeof filePath !== "string" || filePath === "") {
    return null;
  }

  // Must be absolute path
  if (!filePath.startsWith("/") && !/^[A-Za-z]:[/\\]/.test(filePath)) {
    return null;
  }

  // No ".." traversal segments anywhere in the path
  if (filePath.includes("..")) {
    return null;
  }

  // Must be within workspace root
  const normalizedRoot = workspaceRoot.endsWith("/") ? workspaceRoot : workspaceRoot + "/";
  if (!filePath.startsWith(normalizedRoot) && filePath !== workspaceRoot) {
    return null;
  }

  const line = m["line"];
  if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 0) {
    return null;
  }

  return { type: "navigate", filePath, line };
}
