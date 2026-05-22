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

     .dxt-app-shell {
       position: relative;
       height: 100%;
       min-height: 240px;
     }

     .dxt-graph-layer {
       position: relative;
       height: 100%;
       transition:
         opacity 120ms ease,
         transform 180ms ease;
     }

     .dxt-app-shell-indexing .dxt-graph-layer {
       opacity: 0.62;
       transform: scale(0.995);
     }

     .dxt-graph-stage {
       position: relative;
       overflow: hidden;
       border: 1px solid var(--vscode-panel-border, transparent);
       border-radius: 8px;
       background:
         radial-gradient(circle at 16% 14%, color-mix(in srgb, var(--vscode-symbolIcon-fileForeground) 22%, transparent), transparent 40%),
         radial-gradient(circle at 84% 22%, color-mix(in srgb, var(--vscode-charts-green) 20%, transparent), transparent 42%),
         radial-gradient(circle at 52% 88%, color-mix(in srgb, var(--vscode-charts-orange) 16%, transparent), transparent 46%),
         linear-gradient(
           180deg,
           color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%),
           color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground) 4%)
         );
     }

     .dxt-graph-stage::before,
     .dxt-graph-stage::after {
       content: "";
       position: absolute;
       inset: 0;
       pointer-events: none;
     }

     .dxt-graph-stage::before {
       background-image:
         radial-gradient(circle, color-mix(in srgb, var(--vscode-foreground) 18%, transparent) 0.75px, transparent 0.75px);
       background-size: 20px 20px;
       opacity: 0.2;
     }

     .dxt-graph-stage::after {
       background:
         radial-gradient(circle at center, transparent 42%, color-mix(in srgb, var(--vscode-editor-background) 76%, transparent) 100%);
       opacity: 0.9;
     }

     .dxt-graph-scaffold {
       position: relative;
       height: 100%;
       min-height: 240px;
       border-radius: 8px;
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
       box-shadow: 0 4px 18px color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
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

     .dxt-graph-surface {
       position: relative;
       height: 100%;
       min-height: 240px;
       border-radius: 8px;
     }

     .dxt-loading-overlay {
       position: absolute;
       inset: 0;
       display: flex;
       align-items: flex-start;
       justify-content: center;
       padding: 16px;
       pointer-events: none;
     }

     .dxt-index-rail {
       display: flex;
       flex-direction: column;
       gap: 10px;
       width: min(540px, 100%);
       padding: 12px 14px;
       border: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 72%, transparent);
       border-radius: 12px;
       background:
         linear-gradient(
           135deg,
           color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-charts-blue) 8%),
           color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-charts-green) 8%)
         );
       box-shadow: 0 10px 28px color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
        backdrop-filter: blur(4px);
      }

     .dxt-index-rail-active {
       background:
         linear-gradient(
           135deg,
           color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-symbolIcon-fileForeground) 10%),
           color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-charts-blue) 12%)
         );
     }

     .dxt-index-rail-failed {
       background:
         linear-gradient(
           135deg,
           color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-inputValidation-errorBorder) 10%),
           color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-charts-orange) 12%)
         );
     }

     .dxt-index-rail-cancelled {
       background:
         linear-gradient(
           135deg,
           color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-descriptionForeground) 10%),
           color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-charts-blue) 8%)
         );
     }

     .dxt-index-rail-header,
     .dxt-index-meta {
       display: flex;
       align-items: center;
       justify-content: space-between;
       gap: 12px;
     }

     .dxt-index-chip,
     .dxt-index-count {
       display: inline-flex;
       align-items: center;
       min-height: 26px;
       padding: 0 10px;
       border-radius: 999px;
       border: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 72%, transparent);
       background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%);
       font-size: 12px;
       line-height: 1;
     }

     .dxt-index-chip {
       max-width: 100%;
       font-weight: 600;
       color: var(--vscode-foreground);
       white-space: nowrap;
       overflow: hidden;
       text-overflow: ellipsis;
     }

     .dxt-index-count {
       color: var(--vscode-descriptionForeground, var(--vscode-foreground));
     }

     .dxt-index-track {
       position: relative;
       height: 10px;
       overflow: hidden;
       border-radius: 999px;
       background: color-mix(in srgb, var(--vscode-editor-background) 78%, var(--vscode-foreground) 22%);
     }

     .dxt-index-progress,
     .dxt-index-beam {
       position: absolute;
       inset: 0;
       transform-origin: left center;
     }

     .dxt-index-progress {
       background: linear-gradient(
         90deg,
         color-mix(in srgb, var(--vscode-symbolIcon-fileForeground) 88%, transparent),
         color-mix(in srgb, var(--vscode-charts-blue) 80%, transparent),
         color-mix(in srgb, var(--vscode-charts-green) 76%, transparent)
       );
     }

     .dxt-index-beam {
       width: 28%;
       background: linear-gradient(
         90deg,
         transparent,
         color-mix(in srgb, var(--vscode-foreground) 28%, transparent),
         transparent
       );
     }

     .dxt-index-meta {
       justify-content: flex-start;
       color: var(--vscode-descriptionForeground, var(--vscode-foreground));
       font-size: 12px;
       opacity: 0.92;
     }

     .dxt-index-meta .codicon {
       font-size: 16px;
     }

     .dxt-fallback-graph {
       height: 100%;
     }

    .dxt-fallback-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.8fr) minmax(220px, 1fr);
      gap: 10px;
      height: 100%;
    }

    .dxt-fallback-surface {
      position: relative;
      height: 100%;
      min-height: 240px;
      overflow: hidden;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border, transparent);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--vscode-charts-blue) 16%, transparent), transparent 42%),
        radial-gradient(circle at bottom right, color-mix(in srgb, var(--vscode-charts-green) 16%, transparent), transparent 38%),
        var(--vscode-editor-background);
    }

    .dxt-fallback-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .dxt-fallback-edge {
      stroke-width: 1.05;
      stroke-linecap: round;
      opacity: 0.72;
    }

    .dxt-fallback-node {
      cursor: pointer;
      outline: none;
    }

    .dxt-fallback-node-shape {
      fill: color-mix(in srgb, var(--vscode-editor-background) 88%, currentColor 12%);
      stroke: currentColor;
      stroke-width: 0.7;
      transition: fill 120ms ease;
      vector-effect: non-scaling-stroke;
    }

    .dxt-fallback-node:hover .dxt-fallback-node-shape,
    .dxt-fallback-node:focus-visible .dxt-fallback-node-shape {
      fill: color-mix(in srgb, var(--vscode-editor-background) 80%, currentColor 20%);
    }

    .dxt-fallback-node-label {
      fill: var(--vscode-foreground);
      font-size: 2.05px;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
      dominant-baseline: middle;
    }

    .dxt-fallback-relations {
      display: flex;
      flex-direction: column;
      min-height: 240px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%);
      overflow: hidden;
    }

    .dxt-fallback-relations-title {
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.9;
    }

    .dxt-fallback-relation-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: auto;
    }

    .dxt-fallback-relation-item {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      padding: 6px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 70%, transparent);
    }

    .dxt-fallback-relation-item:last-child {
      border-bottom: none;
    }

    .dxt-fallback-relation-node {
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--vscode-textLink-foreground, var(--vscode-foreground));
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .dxt-fallback-relation-node:hover,
    .dxt-fallback-relation-node:focus-visible {
      text-decoration: underline;
      outline: none;
    }

    .dxt-fallback-edge-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--vscode-editor-background);
    }

    .dxt-fallback-edge-pill-defines {
      background: var(--vscode-charts-blue, var(--vscode-foreground));
    }

    .dxt-fallback-edge-pill-imports {
      background: var(--vscode-charts-green, var(--vscode-foreground));
    }

    .dxt-fallback-edge-pill-calls {
      background: var(--vscode-charts-orange, var(--vscode-foreground));
    }

    @media (max-width: 900px) {
      .dxt-fallback-layout {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(240px, 1fr) auto;
      }

      .dxt-fallback-relations {
        min-height: 0;
        max-height: 220px;
      }
    }

     #dxt-graph-container {
       width: 100%;
       height: 100%;
       min-height: 240px;
       border-radius: 8px;
       background-color: transparent;
     }

     .dxt-selection-overlay {
       position: absolute;
       inset: 0;
       width: 100%;
       height: 100%;
       pointer-events: none;
       overflow: visible;
     }

     .dxt-selection-path {
       stroke-width: 2.8;
       stroke-linecap: round;
       stroke-dasharray: 10 7;
       opacity: 0.94;
       filter: drop-shadow(0 0 12px color-mix(in srgb, currentColor 34%, transparent));
     }

     .dxt-selection-traveler {
       opacity: 1;
       filter: drop-shadow(0 0 16px color-mix(in srgb, currentColor 42%, transparent));
     }
   </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
