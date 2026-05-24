import { describe, expect, it } from "vitest";
import { DEFAULT_MERMAID_THEME, isMermaidTheme, MERMAID_INIT_DIRECTIVE } from "./theme.js";

describe("isMermaidTheme", () => {
  it("returns true for 'Light'", () => {
    expect(isMermaidTheme("Light")).toBe(true);
  });

  it("returns true for 'Dark'", () => {
    expect(isMermaidTheme("Dark")).toBe(true);
  });

  it("returns true for 'Print'", () => {
    expect(isMermaidTheme("Print")).toBe(true);
  });

  it("returns false for an invalid string", () => {
    expect(isMermaidTheme("invalid")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMermaidTheme(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMermaidTheme(undefined)).toBe(false);
  });

  it("returns false for numbers", () => {
    expect(isMermaidTheme(0)).toBe(false);
  });

  it("falls back to DEFAULT_MERMAID_THEME when value is invalid (guard pattern)", () => {
    const raw = "NotATheme";
    const theme = isMermaidTheme(raw) ? raw : DEFAULT_MERMAID_THEME;
    expect(theme).toBe("Light");
  });
});

describe("MERMAID_INIT_DIRECTIVE", () => {
  it("Light maps to Mermaid 'default' theme", () => {
    expect(MERMAID_INIT_DIRECTIVE.Light).toContain("'theme': 'default'");
  });

  it("Dark maps to Mermaid 'dark' theme", () => {
    expect(MERMAID_INIT_DIRECTIVE.Dark).toContain("'theme': 'dark'");
  });

  it("Print maps to Mermaid 'neutral' theme", () => {
    expect(MERMAID_INIT_DIRECTIVE.Print).toContain("'theme': 'neutral'");
  });
});

describe("DEFAULT_MERMAID_THEME", () => {
  it("defaults to Light", () => {
    expect(DEFAULT_MERMAID_THEME).toBe("Light");
  });
});
