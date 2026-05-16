import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// acquireVsCodeApi must be called exactly once per webview lifecycle.
// The global is injected by the VS Code webview runtime before this script runs.
// Declared in protocol/vscode.d.ts — no npm package required.
const vscodeApi = acquireVsCodeApi();

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Dextree webview: #root element not found");
}

createRoot(container).render(
  <StrictMode>
    <App vscodeApi={vscodeApi} />
  </StrictMode>,
);
