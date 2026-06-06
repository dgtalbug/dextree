import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createWorkspaceIgnore } from "./workspaceIgnore.js";

// A workspace root that does not exist on disk: the ignore-file reads return
// empty gracefully, so these tests exercise the default + opt-in pattern
// matching in isolation (no fixture files required).
const ROOT = "/virtual/workspace";
const abs = (rel: string): string => join(ROOT, rel);

describe("createWorkspaceIgnore — defaults", () => {
  it("ignores libraries and build output", async () => {
    const wi = await createWorkspaceIgnore(ROOT);
    expect(wi.ignores(abs("node_modules/foo/index.js"))).toBe(true);
    expect(wi.ignores(abs("dist/bundle.js"))).toBe(true);
    expect(wi.ignores(abs("build/out.js"))).toBe(true);
  });

  it("indexes source, docs, and tests by default", async () => {
    const wi = await createWorkspaceIgnore(ROOT);
    expect(wi.ignores(abs("src/app.ts"))).toBe(false);
    expect(wi.ignores(abs("README.md"))).toBe(false);
    expect(wi.ignores(abs("src/app.test.ts"))).toBe(false);
  });
});

describe("createWorkspaceIgnore — ignoreDocumentation toggle", () => {
  it("ignores *.md when on, but not when off", async () => {
    const off = await createWorkspaceIgnore(ROOT, { ignoreDocumentation: false });
    expect(off.ignores(abs("docs/guide.md"))).toBe(false);

    const on = await createWorkspaceIgnore(ROOT, { ignoreDocumentation: true });
    expect(on.ignores(abs("docs/guide.md"))).toBe(true);
    expect(on.ignores(abs("README.md"))).toBe(true);
    // Source is still indexed.
    expect(on.ignores(abs("src/app.ts"))).toBe(false);
  });
});

describe("createWorkspaceIgnore — ignoreTests toggle", () => {
  it("ignores test files when on, but not when off", async () => {
    const off = await createWorkspaceIgnore(ROOT, { ignoreTests: false });
    expect(off.ignores(abs("src/app.test.ts"))).toBe(false);

    const on = await createWorkspaceIgnore(ROOT, { ignoreTests: true });
    expect(on.ignores(abs("src/app.test.ts"))).toBe(true);
    expect(on.ignores(abs("src/app.spec.ts"))).toBe(true);
    expect(on.ignores(abs("src/__tests__/app.ts"))).toBe(true);
    expect(on.ignores(abs("packages/x/test/helper.ts"))).toBe(true);
    // Non-test source is still indexed.
    expect(on.ignores(abs("src/app.ts"))).toBe(false);
  });

  it("keeps libraries + build ignored regardless of the toggles", async () => {
    const wi = await createWorkspaceIgnore(ROOT, {
      ignoreDocumentation: true,
      ignoreTests: true,
    });
    expect(wi.ignores(abs("node_modules/foo/index.js"))).toBe(true);
    expect(wi.ignores(abs("dist/bundle.js"))).toBe(true);
  });
});
