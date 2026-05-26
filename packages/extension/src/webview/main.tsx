import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// acquireVsCodeApi must be called exactly once per webview lifecycle.
// The global is injected by the VS Code webview runtime before this script runs.
// Declared in protocol/vscode.d.ts — no npm package required.
const vscodeApi = acquireVsCodeApi();

// Diagnostic log bridge: forward every console.* call to the extension host
// so the Dextree output channel surfaces what the React app is actually
// doing. Without this the webview iframe's console only lives inside
// "Developer: Open Webview Developer Tools", which is a second devtools
// window most developers never open. Install BEFORE rendering App so any
// startup error inside React is captured.
{
  const LEVELS = ["log", "debug", "info", "warn", "error"] as const;
  type Level = (typeof LEVELS)[number];
  const originals: Record<Level, (...args: unknown[]) => void> = {} as Record<
    Level,
    (...args: unknown[]) => void
  >;
  for (const level of LEVELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originals[level] = (console as any)[level].bind(console);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[level] = (...args: unknown[]) => {
      try {
        originals[level](...args);
      } catch {
        // Original console method itself threw — ignore so we still post.
      }
      try {
        const message = args
          .map((a) => {
            if (typeof a === "string") return a;
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        vscodeApi.postMessage({ type: "webviewLog", level, message });
      } catch {
        // Bridge itself failed — never throw from a console call.
      }
    };
  }
  // Surface uncaught errors and unhandled promise rejections too.
  window.addEventListener("error", (event) => {
    vscodeApi.postMessage({
      type: "webviewLog",
      level: "error",
      message: `window.error: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    vscodeApi.postMessage({
      type: "webviewLog",
      level: "error",
      message: `unhandledrejection: ${message}`,
    });
  });
}

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Dextree webview: #root element not found");
}

createRoot(container).render(
  <StrictMode>
    <App vscodeApi={vscodeApi} />
  </StrictMode>,
);
