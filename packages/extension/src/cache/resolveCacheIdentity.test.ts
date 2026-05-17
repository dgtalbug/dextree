import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveCacheIdentity } from "./resolveCacheIdentity.js";

const tempDirs: string[] = [];

describe("resolveCacheIdentity", () => {
  it("uses the canonical workspace path as the cache key when git metadata is unavailable", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-cache-"));
    tempDirs.push(workspaceRoot);
    const canonicalWorkspaceRoot = await realpath(workspaceRoot);

    await expect(resolveCacheIdentity({ workspaceRoot })).resolves.toEqual({
      cacheKey: canonicalWorkspaceRoot,
      workspaceRoot: canonicalWorkspaceRoot,
      repoRoot: null,
      repoRemote: null,
    });
  });

  it("keeps same-name folders in different parent directories distinct", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "dextree-checkouts-"));
    tempDirs.push(parent);

    const workspaceA = resolve(parent, "a", "repo");
    const workspaceB = resolve(parent, "b", "repo");
    await mkdir(workspaceA, { recursive: true });
    await mkdir(workspaceB, { recursive: true });

    const [identityA, identityB] = await Promise.all([
      resolveCacheIdentity({ workspaceRoot: workspaceA }),
      resolveCacheIdentity({ workspaceRoot: workspaceB }),
    ]);

    expect(identityA.cacheKey).not.toBe(identityB.cacheKey);
    expect(identityA.workspaceRoot).not.toBe(identityB.workspaceRoot);
  });

  it("preserves repository hints when they are provided", async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), "dextree-repo-hints-"));
    tempDirs.push(workspaceRoot);
    const canonicalWorkspaceRoot = await realpath(workspaceRoot);

    await expect(
      resolveCacheIdentity({
        workspaceRoot,
        repoRoot: workspaceRoot,
        repoRemote: "https://github.com/dgtalbug/dextree.git",
      }),
    ).resolves.toEqual({
      cacheKey: canonicalWorkspaceRoot,
      workspaceRoot: canonicalWorkspaceRoot,
      repoRoot: canonicalWorkspaceRoot,
      repoRemote: "https://github.com/dgtalbug/dextree.git",
    });
  });

  it("keeps different local checkouts distinct even when they point at the same remote", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "dextree-same-remote-"));
    tempDirs.push(parent);

    const workspaceA = resolve(parent, "checkout-a");
    const workspaceB = resolve(parent, "checkout-b");
    await mkdir(workspaceA, { recursive: true });
    await mkdir(workspaceB, { recursive: true });

    const [identityA, identityB] = await Promise.all([
      resolveCacheIdentity({
        workspaceRoot: workspaceA,
        repoRemote: "https://github.com/dgtalbug/dextree.git",
      }),
      resolveCacheIdentity({
        workspaceRoot: workspaceB,
        repoRemote: "https://github.com/dgtalbug/dextree.git",
      }),
    ]);

    expect(identityA.repoRemote).toBe(identityB.repoRemote);
    expect(identityA.cacheKey).not.toBe(identityB.cacheKey);
  });
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    }),
  );
});
