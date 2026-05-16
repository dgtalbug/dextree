/**
 * Ambient declaration for acquireVsCodeApi.
 *
 * The VS Code webview runtime injects this global function before the webview
 * script runs. It must be called exactly once per webview lifecycle.
 * Declaring it here avoids a dependency on @types/vscode-webview.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
