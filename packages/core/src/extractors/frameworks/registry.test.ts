import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FRAMEWORK_REGISTRY } from "./registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(here, "registry.ts");

describe("FRAMEWORK_REGISTRY", () => {
  it("self-documents — comment block at top of file is present (FR-005)", async () => {
    const source = await readFile(REGISTRY_PATH, "utf8");
    expect(source).toMatch(/How to add a new framework/);
    expect(source).toMatch(/Where matchers live/);
    expect(source).toMatch(/pnpm test --filter @dextree\/core/);
    expect(source).toMatch(/Data shape/);
  });

  it("contains the 11 seeded frameworks (FR-011)", () => {
    const names = FRAMEWORK_REGISTRY.map((f) => f.name);
    for (const required of [
      "react",
      "vue",
      "vscode-extension",
      "vitest",
      "jest",
      "pytest",
      "express",
      "fastapi",
      "django",
      "gin",
      "cobra",
    ]) {
      expect(names).toContain(required);
    }
    expect(FRAMEWORK_REGISTRY.length).toBeGreaterThanOrEqual(11);
  });

  it("has no duplicate framework names", () => {
    const names = FRAMEWORK_REGISTRY.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("each framework has well-formed metadata", () => {
    for (const def of FRAMEWORK_REGISTRY) {
      expect(def.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.knownRoles.length).toBeGreaterThan(0);
      expect(def.structural.fileGlob.length).toBeGreaterThan(0);
      expect(def.structural.contentPattern.length).toBeGreaterThan(0);
    }
  });

  it("fileRole only emits roles declared in knownRoles", () => {
    // Probe each framework with role-suggestive synthetic inputs and assert
    // any emitted value is in knownRoles. Negative-path null returns are
    // always valid.
    const probes: { filePath: string; content: string }[] = [
      { filePath: "src/App.tsx", content: 'import React from "react";' },
      { filePath: "src/View.vue", content: "<template></template>" },
      { filePath: "src/extension.ts", content: 'import * as vscode from "vscode";' },
      { filePath: "src/a.test.ts", content: 'import { describe } from "vitest";' },
      { filePath: "src/test_app.py", content: "def test_x(): pass" },
      { filePath: "server.ts", content: "app.get('/', () => {})" },
      { filePath: "main.py", content: "@app.get('/')\ndef root(): pass" },
      { filePath: "app/migrations/0001_initial.py", content: "from django.db" },
      { filePath: "app/models.py", content: "from django.db import models" },
      { filePath: "router/auth.go", content: 'r.GET("/", handler)' },
      { filePath: "cmd/root.go", content: "cobra.Command{}" },
    ];

    for (const def of FRAMEWORK_REGISTRY) {
      for (const probe of probes) {
        const role = def.fileRole(probe.filePath, probe.content);
        if (role !== null) {
          expect(def.knownRoles).toContain(role);
        }
      }
    }
  });
});
