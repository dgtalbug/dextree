import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

/**
 * Generates the HTML content for the Dextree Graph View webview panel.
 *
 * Security model:
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
  // Vite (IIFE/lib mode) bundles every CSS-Module into a single emitted
  // stylesheet. It cannot self-inject under our nonce CSP, so it MUST be
  // linked here as a webview resource (covered by `${webview.cspSource}` in
  // style-src). Without this link every `*.module.css` class resolves to a
  // hashed name with no rules — the shell grid, rails, toolbar, and status
  // bar all collapse to default inline/block flow (no sidebar). See the
  // header note on Research Decision #1.
  const webviewCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "dextree.css"),
  );

  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `img-src blob: data:`,
    // The live ForceAtlas2 layout runs in a Web Worker created from a Blob URL
    // (graphology-layout-forceatlas2/worker). Without worker-src the worker
    // falls back to child-src → default-src 'none' and is CSP-blocked, so the
    // graph never animates. blob: is required because the worker is a Blob URL.
    `worker-src blob:`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dextree Graph View</title>
  <link rel="stylesheet" href="${codiconCssUri}" />
  <link rel="stylesheet" href="${webviewCssUri}" />
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

    /* Dextree design tokens. These must live in this nonce-guarded
       inline block — not a CSS Module — because custom properties declared in a
       module :root get scoped/hashed and would not cascade to every component.
       Hex values match scratch/graphview-mockup-final.html: there is no
       --vscode-* token covering architectural layers or framework identity, so
       these are the one allowed exception to the "tokens only" rule. */
    :root {
      /* Architectural-layer palette (classifier output) */
      --layer-entry: #f1c40f;
      --layer-orchestration: #3794ff;
      --layer-domain: #2ecc71;
      --layer-io: #e67e22;
      --layer-util: #9b9b9b;
      --layer-dead: #6b3535;

      /* Framework chip palette */
      --fw-vscode: #007acc;
      --fw-react: #61dafb;
      --fw-vitest: #6e9f18;
      --fw-node: #68a063;

      /* Edge-kind dot colors (Edge Types rail). Unlike the layer/fw
         palettes these track the active theme via --vscode-charts-*, so a custom
         VS Code theme recolors the edge swatches; the hex is only a last-resort
         fallback for themes that omit the chart tokens. */
      --edge-color-contains: var(--vscode-symbolIcon-folderForeground, #c5c5c5);
      --edge-color-defines: var(--vscode-charts-blue, #3794ff);
      --edge-color-imports: var(--vscode-charts-green, #4ec9b0);
      --edge-color-calls: var(--vscode-charts-orange, #ce9178);
      --edge-color-extends: var(--vscode-charts-purple, #c586c0);
      --edge-color-inherits: var(--vscode-charts-purple, #c586c0);
      --edge-color-implements: var(--vscode-charts-yellow, #dcdcaa);
      --edge-color-instantiates: var(--vscode-charts-red, #f44747);
    }

    /* Framework badge (global dxt-badge classes; used by WorkspaceCard chips).
       The per-framework brand color is selected by the data-framework attribute
       and surfaced through --fw-color, matching the mockup. Unknown frameworks
       fall back to the neutral VS Code badge color. */
    .dxt-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      white-space: nowrap;
    }

    .dxt-badge--framework {
      background: color-mix(in srgb, var(--fw-color, var(--vscode-badge-background)) 18%, transparent);
      color: var(--fw-color, var(--vscode-foreground));
      border: 1px solid var(--fw-color, var(--vscode-badge-background));
    }

    [data-framework="vscode"],
    [data-framework="vscode-ext"] { --fw-color: var(--fw-vscode); }
    [data-framework="react"]      { --fw-color: var(--fw-react); }
    [data-framework="vitest"]     { --fw-color: var(--fw-vitest); }
    [data-framework="node"],
    [data-framework="nodejs"]     { --fw-color: var(--fw-node); }

    /* ============================================================
       GraphView canvas overlays. These use global dxt-*
       class names from GraphView's JSX, so the rules live here rather than a
       CSS Module. Translucent backdrops use rgba() by design (no --vscode-*
       token provides a blurred overlay fill — allowed per the layout contract).
       Ported from scratch/graphview-mockup-final.html.
       ============================================================ */
    .dxt-floating {
      position: absolute;
      background: rgba(30, 30, 30, 0.78);
      backdrop-filter: blur(6px);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      padding: 4px;
      z-index: 4;
    }
    .dxt-zoom-controls {
      top: 12px;
      right: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* Focus mode chip: shows the focused node + an exit button while the view
       is collapsed to a node's neighbourhood. */
    .dxt-focus-chip {
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px 4px 10px;
      color: var(--vscode-foreground);
      font-size: 12px;
    }
    .dxt-focus-chip__label {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Lens-first hierarchy hint: communicates that the node/edge filters refine
       the active lens subject rather than operating on the whole graph. */
    .dxt-lens-refine-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 4px 8px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      border-left: 2px solid var(--vscode-focusBorder);
      background: var(--vscode-editorWidget-background);
    }

    /* Icon button used by the canvas overlays (mirrors GraphToolbar's .iconBtn,
       but global so the overlay buttons in GraphView's JSX are styled). */
    .dxt-icon-btn {
      height: 28px;
      min-width: 28px;
      padding: 0 6px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: inherit;
      font-size: 12px;
    }
    .dxt-icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .dxt-canvas-help {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: rgba(30, 30, 30, 0.65);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 12px;
      padding: 3px 12px;
      display: inline-flex;
      gap: 12px;
      z-index: 4;
    }
    .dxt-canvas-help kbd {
      font: inherit;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 3px;
      padding: 0 4px;
      font-size: 10px;
      color: var(--vscode-foreground);
    }

    .dxt-legend {
      position: absolute;
      bottom: 12px;
      left: 12px;
      padding: 8px 10px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: rgba(30, 30, 30, 0.78);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      z-index: 4;
    }
    .dxt-legend-title {
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--vscode-foreground);
    }
    .dxt-legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 1px 0;
    }
    .dxt-legend-sep {
      border: 0;
      border-top: 1px solid var(--vscode-editorWidget-border);
      margin: 6px 0;
    }
    .dxt-legend-chip {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 4px;
    }
    .dxt-legend-swatch {
      width: 18px;
      height: 2px;
      border-radius: 2px;
    }

    .dxt-error-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

     #root {
       height: 100%;
       overflow: hidden;
       /* Edge-to-edge: the GraphView shell owns its own gutters (toolbar/rail
          padding), matching the mockup's full-bleed 100vw/100vh window. A root
          inset would float the shell and stop the toolbar/status bars from
          reaching the panel edges. */
       padding: 0;
     }

     .dxt-app-shell {
       position: relative;
       height: 100%;
       min-height: 240px;
     }

     .dxt-graph-layer {
       position: relative;
       height: 100%;
       padding-right: min(270px, 32%);
       transition:
         opacity 120ms ease,
         transform 180ms ease;
     }

     .dxt-app-shell-indexing .dxt-graph-layer {
       opacity: 0.62;
       transform: scale(0.995);
     }

     @keyframes dxt-graph-enter {
       from { opacity: 0; transform: scale(0.97); }
       to   { opacity: 1; transform: scale(1); }
     }

     .dxt-graph-stage {
       position: relative;
       overflow: hidden;
       border: 1px solid var(--vscode-panel-border, transparent);
       border-radius: 8px;
       background: var(--vscode-editor-background);
       animation: dxt-graph-enter 0.35s ease-out both;
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
         radial-gradient(circle, color-mix(in srgb, var(--vscode-foreground) 28%, transparent) 0.55px, transparent 0.55px);
       background-size: 14px 14px;
       opacity: 0.18;
     }

     /* ::after vignette removed — keeps dot grid visible at the canvas edges */
     .dxt-graph-stage::after {
       opacity: 0;
     }

     .dxt-graph-scaffold {
       position: relative;
       height: 100%;
       min-height: 240px;
       border-radius: 8px;
     }

     /* Empty/Loading overlay — covers the GraphView shell without replacing it.
        The shell rails stay mounted underneath. */
     .dxt-graph-overlay {
       position: absolute;
       inset: 0;
       display: flex;
       align-items: center;
       justify-content: center;
       padding: 16px;
       background: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent);
       z-index: 5;
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
       display: flex;
       flex-direction: row;
       align-items: stretch;
     }

     .dxt-graph-surface {
       position: relative;
       flex: 1 1 auto;
       min-width: 0;
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

     .dxt-graph-pulse {
       display: block;
       width: 100%;
       height: 72px;
       margin-bottom: 4px;
     }

     .dxt-pulse-edge {
       stroke: color-mix(in srgb, var(--vscode-charts-blue) 60%, var(--vscode-foreground) 40%);
       stroke-width: 0.9;
       fill: none;
       opacity: 0.55;
     }

     .dxt-pulse-node {
       fill: var(--vscode-charts-blue);
       opacity: 0.75;
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
       stroke-width: 4.2;
       stroke-linecap: round;
       stroke-dasharray: 14 7;
       opacity: 1;
       filter: drop-shadow(0 0 16px color-mix(in srgb, currentColor 55%, transparent));
     }

     /* IMPORTS edges in the selection overlay: tighter dash pattern to distinguish
        file→file import lines from CALLS/DEFINES edges visually */
     .dxt-selection-path--imports {
       stroke-dasharray: 5 5;
       stroke-width: 3;
       opacity: 0.8;
     }

     .dxt-selection-traveler {
       opacity: 1;
       filter: drop-shadow(0 0 20px color-mix(in srgb, currentColor 65%, transparent));
     }

     /* ------------------------------------------------------------------
        Side panel: stats / legend / actions
     ------------------------------------------------------------------ */
     .dxt-graph-panel {
       position: absolute;
       top: 14px;
       right: 14px;
       bottom: 14px;
       width: min(240px, 30%);
       display: flex;
       flex-direction: column;
       gap: 10px;
       padding: 12px;
       border: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 70%, transparent);
       border-radius: 10px;
       background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-foreground) 10%);
       overflow-y: auto;
       font-size: 12px;
       z-index: 10;
     }

     .dxt-stats-grid {
       display: grid;
       grid-template-columns: 1fr 1fr;
       gap: 6px;
     }

     .dxt-stat-cell {
       display: flex;
       flex-direction: column;
       align-items: center;
       padding: 6px 4px;
       border-radius: 6px;
       background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-foreground) 20%);
     }

     .dxt-stat-cell-warn {
       background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-inputValidation-errorBorder, #f44) 20%);
     }

     .dxt-stat-value {
       font-size: 18px;
       font-weight: 700;
       line-height: 1.1;
       color: var(--vscode-foreground);
     }

     .dxt-stat-label {
       font-size: 10px;
       opacity: 0.7;
       text-transform: uppercase;
       letter-spacing: 0.06em;
     }

     .dxt-graph-legend,
     .dxt-graph-file-list,
     .dxt-graph-stats,
     .dxt-graph-actions {
       display: flex;
       flex-direction: column;
       gap: 6px;
     }

     .dxt-legend-title {
       font-size: 10px;
       font-weight: 700;
       text-transform: uppercase;
       letter-spacing: 0.08em;
       opacity: 0.65;
       margin-bottom: 2px;
     }

     .dxt-legend-row {
       display: flex;
       align-items: center;
       gap: 8px;
     }

     .dxt-legend-pill {
       display: inline-block;
       width: 28px;
       height: 4px;
       border-radius: 999px;
       flex-shrink: 0;
     }

     .dxt-legend-pill-defines      { background: var(--vscode-charts-blue, #4c9cd4); }
     .dxt-legend-pill-imports      { background: var(--vscode-charts-green, #4ec94e); }
     .dxt-legend-pill-calls        { background: var(--vscode-charts-orange, #e8a84a); }
     .dxt-legend-pill-inherits     { background: var(--vscode-charts-purple, #a371f7); }
     .dxt-legend-pill-instantiates { background: var(--vscode-charts-yellow, #d6c649); }
     .dxt-legend-pill-implements   { background: var(--vscode-charts-red, #d96b6b); }
     .dxt-legend-pill-custom       { background: var(--vscode-charts-purple, #a371f7); }

     .dxt-legend-label {
       font-size: 11px;
       opacity: 0.85;
     }

     .dxt-file-list {
       list-style: none;
       display: flex;
       flex-direction: column;
       gap: 3px;
       margin: 0;
       padding: 0;
     }

     .dxt-file-list-item {
       display: flex;
       align-items: center;
       gap: 5px;
       font-size: 11px;
       opacity: 0.8;
       white-space: nowrap;
       overflow: hidden;
       text-overflow: ellipsis;
     }

     .dxt-panel-button {
       display: flex;
       align-items: center;
       gap: 5px;
       width: 100%;
       padding: 6px 10px;
       border-radius: 5px;
       border: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 70%, transparent);
       background: color-mix(in srgb, var(--vscode-editor-background) 82%, var(--vscode-foreground) 18%);
       color: var(--vscode-foreground);
       font: inherit;
       font-size: 12px;
       cursor: pointer;
       text-align: left;
       transition: background 100ms ease, opacity 100ms ease;
     }

     .dxt-panel-button:hover:not(:disabled) {
       background: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-foreground) 30%);
     }

     .dxt-panel-button:disabled { opacity: 0.45; cursor: default; }

     .dxt-panel-button-primary {
       background: color-mix(in srgb, var(--vscode-charts-blue, #4c9cd4) 22%, var(--vscode-editor-background) 78%);
       border-color: color-mix(in srgb, var(--vscode-charts-blue, #4c9cd4) 40%, transparent);
     }

     .dxt-panel-button-primary:hover:not(:disabled) {
       background: color-mix(in srgb, var(--vscode-charts-blue, #4c9cd4) 35%, var(--vscode-editor-background) 65%);
     }

     .dxt-panel-button-danger {
       background: color-mix(in srgb, var(--vscode-inputValidation-errorBorder, #f44) 16%, var(--vscode-editor-background) 84%);
       border-color: color-mix(in srgb, var(--vscode-inputValidation-errorBorder, #f44) 35%, transparent);
     }

     .dxt-panel-button-danger:hover:not(:disabled) {
       background: color-mix(in srgb, var(--vscode-inputValidation-errorBorder, #f44) 28%, var(--vscode-editor-background) 72%);
     }

     .dxt-panel-button-active {
       background: color-mix(in srgb, var(--vscode-charts-blue) 22%, var(--vscode-editor-background) 78%);
       border-color: color-mix(in srgb, var(--vscode-charts-blue) 45%, transparent);
       color: var(--vscode-charts-blue, var(--vscode-foreground));
     }

     .dxt-panel-button-active:hover:not(:disabled) {
       background: color-mix(in srgb, var(--vscode-charts-blue) 32%, var(--vscode-editor-background) 68%);
     }

     @media (max-width: 720px) {
       .dxt-graph-panel {
         position: relative;
         top: auto; right: auto; bottom: auto;
         width: 100%;
         flex-direction: row;
         flex-wrap: wrap;
         border-radius: 6px;
       }
     }

     /* B1 — Cluster hull canvas layer */
     .dxt-cluster-layer {
       position: absolute;
       inset: 0;
       width: 100%;
       height: 100%;
       pointer-events: none;
       z-index: 1;
       border-radius: 8px;
     }

     /* B3 — Caller/callee neighbour panel */
     .dxt-neighbor-panel {
       position: absolute;
       top: 14px;
       right: 14px;
       bottom: 14px;
       width: min(220px, 28%);
       display: flex;
       flex-direction: column;
       gap: 10px;
       padding: 12px;
       border: 1px solid color-mix(in srgb, var(--vscode-panel-border, transparent) 70%, transparent);
       border-radius: 10px;
       background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-foreground) 10%);
       overflow-y: auto;
       font-size: 12px;
       z-index: 10;
     }

     .dxt-neighbor-section {
       display: flex;
       flex-direction: column;
       gap: 4px;
     }

     .dxt-neighbor-section-title {
       font-size: 10px;
       font-weight: 700;
       text-transform: uppercase;
       letter-spacing: 0.08em;
       opacity: 0.65;
       margin-bottom: 2px;
     }

     .dxt-neighbor-row {
       display: flex;
       align-items: center;
       gap: 5px;
       padding: 3px 0;
       border: 0;
       background: transparent;
       color: var(--vscode-textLink-foreground, var(--vscode-foreground));
       font: inherit;
       font-size: 11px;
       cursor: pointer;
       text-align: left;
       width: 100%;
       white-space: nowrap;
       overflow: hidden;
       text-overflow: ellipsis;
     }

     .dxt-neighbor-row:hover,
     .dxt-neighbor-row:focus-visible {
       text-decoration: underline;
       outline: none;
     }

     .dxt-neighbor-badge {
       display: inline-flex;
       align-items: center;
       padding: 2px 6px;
       border-radius: 999px;
       font-size: 10px;
       font-weight: 700;
       background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-foreground) 20%);
       flex-shrink: 0;
     }

     .dxt-neighbor-more {
       font-size: 11px;
       opacity: 0.65;
       padding: 2px 0;
     }

     /* B4 — Mini-map */
     .dxt-minimap-canvas {
       position: absolute;
       bottom: 14px;
       left: 14px;
       border-radius: 6px;
       z-index: 10;
       pointer-events: auto;
       cursor: crosshair;
     }

      .dxt-minimap-canvas--hidden {
        display: none;
      }

      .dxt-toolbar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 11;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 8px;
        box-sizing: border-box;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border, transparent);
      }

      .dxt-toolbar__export {
        flex-shrink: 0;
      }

      .dxt-toolbar__pills {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .dxt-toolbar__pills::-webkit-scrollbar {
        display: none;
      }

      .dxt-toolbar__minimap-toggle {
        flex-shrink: 0;
      }

      /* Layout preset dropdown */
      .dxt-layout-preset {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 4px;
        background: transparent;
        color: var(--vscode-foreground);
        font-size: 12px;
        flex-shrink: 0;
      }

      .dxt-layout-preset:hover {
        border-color: var(--vscode-focusBorder, var(--vscode-panel-border, transparent));
      }

      .dxt-layout-preset__label-text {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      }

      .dxt-layout-preset__select {
        background: transparent;
        color: var(--vscode-foreground);
        border: none;
        font: inherit;
        cursor: pointer;
        outline: none;
        appearance: none;
        padding-right: 14px;
        background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                          linear-gradient(135deg, currentColor 50%, transparent 50%);
        background-position: calc(100% - 7px) center, calc(100% - 3px) center;
        background-size: 4px 4px;
        background-repeat: no-repeat;
      }

      .dxt-layout-preset__select:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
      }

      .dxt-layout-preset__select option {
        background: var(--vscode-dropdown-background, var(--vscode-editor-background));
        color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      }

      /* Non-blocking notice for Hierarchical fallback */
      .dxt-layout-notice {
        position: absolute;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 5;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: min(560px, calc(100% - 32px));
        padding: 6px 12px;
        border-radius: 4px;
        background: var(--vscode-notifications-background, var(--vscode-editor-background));
        color: var(--vscode-notifications-foreground, var(--vscode-foreground));
        border: 1px solid var(--vscode-notifications-border, var(--vscode-panel-border));
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        font-size: 12px;
        pointer-events: none;
        animation: dxt-layout-notice-in 0.18s ease-out;
      }

      .dxt-layout-notice .codicon {
        color: var(--vscode-notificationsInfoIcon-foreground, currentColor);
      }

      .dxt-layout-notice__text {
        white-space: normal;
      }

      @keyframes dxt-layout-notice-in {
        from {
          opacity: 0;
          transform: translate(-50%, -6px);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }

      .dxt-minimap-toggle {
        background: transparent;
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 4px;
       padding: 4px;
       cursor: pointer;
       color: var(--vscode-foreground);
       opacity: 0.6;
     }

     .dxt-minimap-toggle:hover {
       opacity: 1;
      }

      .dxt-export-mermaid {
        background: transparent;
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 4px;
       padding: 4px;
       cursor: pointer;
       color: var(--vscode-foreground);
       opacity: 0.6;
     }

     .dxt-export-mermaid:hover {
       opacity: 1;
     }

      .dxt-edge-filter-bar {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: center;
        width: max-content;
      }

     .dxt-edge-filter-pill {
       display: flex;
       align-items: center;
       gap: 5px;
       padding: 3px 9px 3px 6px;
       border-radius: 99px;
       border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
       background: var(--vscode-editor-background, #1e1e1e);
       color: var(--vscode-foreground);
       font-size: 11px;
       line-height: 1.4;
       cursor: pointer;
       opacity: 0.85;
       white-space: nowrap;
     }

     .dxt-edge-filter-pill:hover {
       opacity: 1;
       border-color: var(--vscode-focusBorder, rgba(128,128,128,0.6));
     }

     .dxt-edge-filter-pill--disabled {
       opacity: 0.35;
     }

     .dxt-edge-filter-dot {
       width: 8px;
       height: 8px;
       border-radius: 50%;
       background: var(--pill-color, var(--vscode-foreground));
       flex-shrink: 0;
     }

     .dxt-edge-filter-pill[data-kind="DEFINES"]      { --pill-color: var(--vscode-charts-blue,   #3794ff); }
     .dxt-edge-filter-pill[data-kind="IMPORTS"]      { --pill-color: var(--vscode-charts-green,  #4ec9b0); }
     .dxt-edge-filter-pill[data-kind="CALLS"]        { --pill-color: var(--vscode-charts-orange, #ce9178); }
     .dxt-edge-filter-pill[data-kind="INHERITS"]     { --pill-color: var(--vscode-charts-purple, #c586c0); }
     .dxt-edge-filter-pill[data-kind="INSTANTIATES"] { --pill-color: var(--vscode-charts-red,    #f44747); }
   </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
