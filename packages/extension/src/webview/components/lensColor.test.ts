import { describe, expect, it } from "vitest";

import { LENS_DIM_ALPHA, dimColor } from "./lensColor.js";

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
