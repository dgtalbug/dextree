import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import picomatch from "picomatch";

const ALWAYS_EXCLUDE = new Set(["node_modules", "dist", "build", "out", ".git"]);

import type { Logger } from "../../types.js";
import type { DetectFrameworksParams } from "./types.js";

/**
 * Build a `DetectFrameworksParams`-compatible fsIO over `workspaceRoot`.
 * Skips heavy dirs (node_modules/dist/build/out/.git) and reads files
 * lazily. Errors during read are surfaced as `null` so matchers stay silent.
 */
export function createNodeFsIO(workspaceRoot: string, logger?: Logger): DetectFrameworksParams {
  return {
    workspaceRoot,
    ...(logger === undefined ? {} : { logger }),
    async readFile(rel: string) {
      try {
        return await readFile(join(workspaceRoot, rel), "utf8");
      } catch {
        return null;
      }
    },
    async listFiles(glob: string) {
      const matcher = picomatch(glob, { dot: false });
      const out: string[] = [];
      await walk(workspaceRoot, workspaceRoot, matcher, out);
      return out;
    },
  };
}

async function walk(
  root: string,
  dir: string,
  matcher: (path: string) => boolean,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ALWAYS_EXCLUDE.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, matcher, out);
    } else if (entry.isFile()) {
      const rel = relative(root, abs).split(sep).join("/");
      if (matcher(rel)) out.push(rel);
    }
  }
}
