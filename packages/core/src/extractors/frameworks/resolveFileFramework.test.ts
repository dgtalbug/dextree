import { describe, expect, it } from "vitest";

import type { DetectedFramework } from "./types.js";
import { resolveFileFramework } from "./resolveFileFramework.js";

function detected(...names: string[]): DetectedFramework[] {
  return names.map((name) => ({
    frameworkName: name,
    detectionSource: "manifest+structural",
    confidence: 1.0,
  }));
}

describe("resolveFileFramework", () => {
  it("attributes a React .tsx component", () => {
    const result = resolveFileFramework(
      "packages/extension/src/webview/App.tsx",
      'import React from "react";',
      detected("react"),
    );
    expect(result).toEqual({ framework: "react", role: "component" });
  });

  it("returns null when no detected framework claims the file", () => {
    const result = resolveFileFramework("README.md", "# Hi", detected("react"));
    expect(result).toBeNull();
  });

  it("returns null when detected is empty", () => {
    const result = resolveFileFramework("src/App.tsx", 'from "react"', []);
    expect(result).toBeNull();
  });

  it("picks the earlier-registered framework on collision", () => {
    // Both vitest and jest match `.test.ts` files. The registry lists vitest
    // before jest, so vitest wins.
    const result = resolveFileFramework(
      "src/a.test.ts",
      'import { describe } from "vitest"; describe("x", () => {});',
      detected("vitest", "jest"),
    );
    expect(result?.framework).toBe("vitest");
  });

  it("respects detection scope — file role only resolves if framework was detected", () => {
    // .tsx file with react import, but react was not detected in the
    // workspace. Should not attribute.
    const result = resolveFileFramework(
      "src/App.tsx",
      'import React from "react";',
      detected("django"),
    );
    expect(result).toBeNull();
  });
});
