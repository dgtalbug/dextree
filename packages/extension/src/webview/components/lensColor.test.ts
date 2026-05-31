import { describe, expect, it } from "vitest";

import { LAYER_COLORS, LENS_DIM_ALPHA, dimColor, layerColor } from "./lensColor.js";

describe("dimColor", () => {
  it("converts 6-char hex to rgba with reduced alpha", () => {
    expect(dimColor("#ff8800")).toBe(`rgba(255, 136, 0, ${LENS_DIM_ALPHA})`);
  });

  it("expands 3-char hex shorthand before converting to rgba", () => {
    expect(dimColor("#f80")).toBe(`rgba(255, 136, 0, ${LENS_DIM_ALPHA})`);
  });

  it("rescales the alpha channel of an existing rgba color", () => {
    expect(dimColor("rgba(10, 20, 30, 1)")).toBe(`rgba(10, 20, 30, ${LENS_DIM_ALPHA})`);
    expect(dimColor("rgba(10, 20, 30, 0.8)")).toBe(`rgba(10, 20, 30, ${LENS_DIM_ALPHA})`);
  });

  it("converts rgb to rgba with reduced alpha", () => {
    expect(dimColor("rgb(10, 20, 30)")).toBe(`rgba(10, 20, 30, ${LENS_DIM_ALPHA})`);
  });

  it("passes through unknown formats unchanged", () => {
    expect(dimColor("var(--vscode-foreground)")).toBe("var(--vscode-foreground)");
    expect(dimColor("hsl(120, 50%, 50%)")).toBe("hsl(120, 50%, 50%)");
  });
});

describe("layerColor", () => {
  it("returns a VS Code chart token for each of the five real layers", () => {
    for (const layer of ["presentation", "application", "domain", "infrastructure", "test"]) {
      const color = layerColor(layer);
      expect(color).not.toBeNull();
      expect(color).toBe(LAYER_COLORS[layer]);
      expect(color).toContain("var(--vscode-charts-");
    }
  });

  it("returns null for the unknown layer so the node keeps its base colour", () => {
    expect(layerColor("unknown")).toBeNull();
  });

  it("returns null for an absent layer", () => {
    expect(layerColor(undefined)).toBeNull();
  });

  it("uses no hardcoded hex as the primary value (chart token first)", () => {
    for (const color of Object.values(LAYER_COLORS)) {
      expect(color.startsWith("var(--vscode-charts-")).toBe(true);
    }
  });
});
