import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
    }),
  },
}));

import { getWebviewContent } from "./html.js";

/**
 * Minimal Webview stub. `asWebviewUri` echoes the resource fsPath so the test
 * can assert which dist assets the HTML links without the VS Code runtime.
 */
function makeWebview() {
  return {
    cspSource: "vscode-resource://test",
    asWebviewUri: (uri: { fsPath: string }) => ({
      toString: () => `webview://${uri.fsPath}`,
    }),
  } as unknown as Parameters<typeof getWebviewContent>[0];
}

function makeExtensionUri() {
  return { fsPath: "/ext" } as unknown as Parameters<typeof getWebviewContent>[1];
}

describe("getWebviewContent", () => {
  it("links the codicon stylesheet", () => {
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    expect(html).toContain("codicon.css");
    expect(html).toMatch(/<link rel="stylesheet" href="[^"]*codicon\.css"/);
  });

  it("links the bundled webview CSS so CSS-Module styles apply (regression guard)", () => {
    // The Vite IIFE build emits dist/webview/dextree.css; it cannot self-inject
    // under the nonce CSP, so the HTML must link it explicitly. Without this the
    // 3-column shell grid and every rail/toolbar/status module class collapse to
    // default flow (no sidebar).
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    expect(html).toContain("dextree.css");
    expect(html).toMatch(/<link rel="stylesheet" href="[^"]*dextree\.css"/);
  });

  it("loads the webview script bundle", () => {
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    expect(html).toMatch(/<script[^>]*src="[^"]*webview\.js"/);
  });

  it("allows webview-resource stylesheets in the CSP style-src", () => {
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    // The linked dextree.css / codicon.css are webview resources, so the CSP
    // must permit cspSource in style-src (alongside the nonce for inline style).
    expect(html).toMatch(/style-src 'nonce-[^']+' vscode-resource:\/\/test/);
  });

  it("permits blob: and data: in img-src for PNG export and SVG rasterization", () => {
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    // exportPreview uses URL.createObjectURL (blob:) to load an SVG into an
    // <img> and canvas.toDataURL (data:) to produce the PNG output. Without
    // img-src blob: data: the default-src 'none' fallback blocks both.
    expect(html).toContain("img-src blob: data:");
  });

  it("permits blob: in worker-src so the live ForceAtlas2 layout worker can start", () => {
    const html = getWebviewContent(makeWebview(), makeExtensionUri());
    // graphology FA2 supervisor creates a Web Worker from a Blob URL. Without
    // worker-src blob: it falls back to default-src 'none' and is CSP-blocked,
    // so the graph never animates (the symptom that motivated this directive).
    expect(html).toContain("worker-src blob:");
  });
});
