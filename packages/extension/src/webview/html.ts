import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

/**
 * Generates the HTML content for the Dextree Graph View webview panel.
 *
 * Security model (FR-011, FR-012):
 *  - A per-render nonce is used to allowlist exactly our script and our inline
 *    style block. No `unsafe-inline` or `unsafe-eval` is used.
 *  - `webview.cspSource` covers the VS Code resource scheme needed for font loading.
 *  - Global styles are inlined with a nonce rather than imported in main.tsx
 *    because Vite IIFE mode JS-injects CSS imports at runtime, which is blocked
 *    by a nonce-based CSP policy (Research Decision #1).
 *
 * @param webview - The VS Code Webview instance
 * @param extensionUri - The extension's root URI (used to build webviewUri paths)
 */
export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString("base64");

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "webview.js"),
  );
  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "codicons", "codicon.css"),
  );

  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dextree Graph View</title>
  <link rel="stylesheet" href="${codiconCssUri}" />
  <style nonce="${nonce}">
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html,
    body {
      height: 100%;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }

    #root {
      height: 100%;
      overflow: auto;
      padding: 8px;
    }

    button {
      all: unset;
      cursor: pointer;
    }

    ul {
      list-style: none;
    }

    .dxt-loading,
    .dxt-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 100%;
      opacity: 0.7;
    }

    .dxt-loading .codicon,
    .dxt-empty .codicon {
      font-size: 32px;
    }

    .dxt-tree {
      width: 100%;
    }

    .dxt-tree-children {
      padding-left: 16px;
    }

    .dxt-dir-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      padding: 3px 4px;
      border-radius: 3px;
      font-size: 0.9em;
      font-weight: 600;
    }

    .dxt-dir-btn:hover,
    .dxt-dir-btn:focus-visible {
      background-color: var(--vscode-list-hoverBackground);
      outline: 1px solid var(--vscode-focusBorder);
    }

    .dxt-dir-name {
      opacity: 0.75;
    }

    .dxt-symbol-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 3px 4px;
      border-radius: 3px;
    }

    .dxt-symbol-btn:hover,
    .dxt-symbol-btn:focus-visible {
      background-color: var(--vscode-list-hoverBackground);
      outline: 1px solid var(--vscode-focusBorder);
    }

    .dxt-symbol-kind {
      font-size: 0.8em;
      opacity: 0.5;
      margin-left: auto;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
