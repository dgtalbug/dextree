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
      overflow: hidden;
      padding: 8px;
    }

    .dxt-loading,
    .dxt-empty,
    .dxt-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 100%;
      opacity: 0.7;
      text-align: center;
    }

    .dxt-empty-preview {
      width: min(360px, 100%);
      margin-top: 12px;
      padding: 12px;
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--vscode-editor-background) 82%, var(--vscode-foreground) 18%);
    }

    .dxt-preview-canvas {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 168px;
    }

    .dxt-preview-node {
      position: absolute;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 88px;
      padding: 8px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--vscode-panel-border, transparent);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
    }

    .dxt-preview-node-file {
      left: 12px;
      background: color-mix(in srgb, var(--vscode-symbolIcon-fileForeground) 18%, var(--vscode-editor-background) 82%);
      color: var(--vscode-symbolIcon-fileForeground);
    }

    .dxt-preview-node-symbol {
      right: 18px;
      background: color-mix(in srgb, var(--vscode-symbolIcon-classForeground) 18%, var(--vscode-editor-background) 82%);
      color: var(--vscode-symbolIcon-classForeground);
    }

    .dxt-preview-node-symbol-top {
      top: 26px;
    }

    .dxt-preview-node-symbol-bottom {
      bottom: 24px;
    }

    .dxt-preview-link {
      position: absolute;
      left: 116px;
      width: 120px;
      height: 2px;
      transform-origin: left center;
      opacity: 0.9;
    }

    .dxt-preview-link-defines {
      top: 72px;
      background: var(--vscode-charts-blue, var(--vscode-foreground));
      transform: rotate(-18deg);
    }

    .dxt-preview-link-calls {
      bottom: 58px;
      background: var(--vscode-charts-orange, var(--vscode-foreground));
      transform: rotate(14deg);
    }

    .dxt-preview-caption {
      font-size: 12px;
      opacity: 0.85;
      line-height: 1.4;
    }

    .dxt-loading .codicon,
    .dxt-empty .codicon,
    .dxt-error .codicon {
      font-size: 32px;
    }

    .dxt-graph-view {
      height: 100%;
    }

    .dxt-fallback-graph {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }

    .dxt-fallback-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.82;
      font-size: 12px;
    }

    .dxt-fallback-surface {
      position: relative;
      flex: 1;
      min-height: 240px;
      overflow: hidden;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border, transparent);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--vscode-charts-blue) 16%, transparent), transparent 42%),
        radial-gradient(circle at bottom right, color-mix(in srgb, var(--vscode-charts-green) 16%, transparent), transparent 38%),
        var(--vscode-editor-background);
    }

    .dxt-fallback-edges {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0.85;
    }

    .dxt-fallback-node {
      position: absolute;
      transform: translate(-50%, -50%);
      min-width: 88px;
      max-width: 180px;
      padding: 8px 10px;
      border-radius: 999px;
      border: 1px solid currentColor;
      background: color-mix(in srgb, var(--vscode-editor-background) 84%, currentColor 16%);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    .dxt-fallback-node:hover {
      background: color-mix(in srgb, var(--vscode-editor-background) 74%, currentColor 26%);
    }

    .dxt-fallback-node-file {
      box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 22%, transparent);
    }

    #dxt-graph-container {
      width: 100%;
      height: 100%;
      min-height: 240px;
      border-radius: 3px;
      background-color: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
