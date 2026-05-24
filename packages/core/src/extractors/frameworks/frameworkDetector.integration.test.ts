import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { detectFrameworks } from "./detector.js";
import { createNodeFsIO } from "./fsIO.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(here, "__fixtures__/dextree-like");

describe("frameworkDetector integration (dextree-like fixture)", () => {
  it("SC-001: detects vscode-extension, react, and vitest", async () => {
    const detected = await detectFrameworks(createNodeFsIO(FIXTURE_ROOT));
    const names = detected.map((d) => d.frameworkName);

    expect(names).toContain("vscode-extension");
    expect(names).toContain("react");
    expect(names).toContain("vitest");
  });

  it("all detections have manifest+structural source + confidence 1.0", async () => {
    const detected = await detectFrameworks(createNodeFsIO(FIXTURE_ROOT));
    for (const row of detected) {
      expect(row.detectionSource).toBe("manifest+structural");
      expect(row.confidence).toBe(1.0);
    }
  });

  it("is deterministic — two consecutive runs produce identical results", async () => {
    const a = await detectFrameworks(createNodeFsIO(FIXTURE_ROOT));
    const b = await detectFrameworks(createNodeFsIO(FIXTURE_ROOT));
    expect(a).toEqual(b);
  });
});
