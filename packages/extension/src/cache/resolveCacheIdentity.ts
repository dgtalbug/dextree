import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type { WorkspaceCacheIdentity } from "@dextree/core";

const execFileAsync = promisify(execFile);

export interface ResolveCacheIdentityInput {
  workspaceRoot: string;
  repoRoot?: string | null;
  repoRemote?: string | null;
}

async function runGit(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function resolveCacheIdentity(
  input: ResolveCacheIdentityInput,
): Promise<WorkspaceCacheIdentity> {
  const workspaceRoot = await realpath(input.workspaceRoot);
  const resolvedRepoRoot =
    input.repoRoot === undefined
      ? await runGit(["rev-parse", "--show-toplevel"], workspaceRoot)
      : input.repoRoot;
  const repoRoot =
    resolvedRepoRoot === undefined || resolvedRepoRoot === null
      ? null
      : await realpath(resolvedRepoRoot);
  const repoRemote =
    input.repoRemote === undefined
      ? await runGit(["remote", "get-url", "origin"], workspaceRoot)
      : input.repoRemote;

  return {
    cacheKey: workspaceRoot,
    workspaceRoot,
    repoRoot,
    repoRemote: repoRemote ?? null,
  };
}
