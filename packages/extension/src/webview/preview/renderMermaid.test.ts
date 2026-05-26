import { describe, expect, it } from "vitest";

import { renderMermaidSource, resolveMermaidThemeFromBody } from "./renderMermaid.js";

describe("resolveMermaidThemeFromBody (slice 029 US1)", () => {
  it("maps vscode-light to 'light'", () => {
    const body = { dataset: { vscodeThemeKind: "vscode-light" } };
    expect(resolveMermaidThemeFromBody(body)).toBe("light");
  });

  it("maps vscode-dark to 'dark'", () => {
    const body = { dataset: { vscodeThemeKind: "vscode-dark" } };
    expect(resolveMermaidThemeFromBody(body)).toBe("dark");
  });

  it("maps vscode-high-contrast-light to 'light'", () => {
    const body = { dataset: { vscodeThemeKind: "vscode-high-contrast-light" } };
    expect(resolveMermaidThemeFromBody(body)).toBe("light");
  });

  it("maps vscode-high-contrast (no light/dark suffix → dark) to 'dark'", () => {
    const body = { dataset: { vscodeThemeKind: "vscode-high-contrast" } };
    expect(resolveMermaidThemeFromBody(body)).toBe("dark");
  });

  it("defaults to 'light' when the data attribute is missing", () => {
    const body = { dataset: {} };
    expect(resolveMermaidThemeFromBody(body)).toBe("light");
  });

  it("defaults to 'light' for an empty string", () => {
    const body = { dataset: { vscodeThemeKind: "" } };
    expect(resolveMermaidThemeFromBody(body)).toBe("light");
  });
});

describe("renderMermaidSource — fail-closed paths (slice 029 US1)", () => {
  it("returns render-error for an empty source string without invoking the Mermaid runtime", async () => {
    const result = await renderMermaidSource("", "light");
    expect(result.status).toBe("render-error");
    if (result.status === "render-error") {
      expect(result.source).toBe("");
      expect(result.reason).toMatch(/empty/i);
    }
  });
});
