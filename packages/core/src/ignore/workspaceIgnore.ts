import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import ignore, { type Ignore } from "ignore";

const DEFAULT_PATTERNS = [
  "node_modules",
  ".git",
  ".dextree",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".next",
  ".cache",
];

const IGNORE_FILES = [".gitignore", ".dextreeignore"];

export interface WorkspaceIgnore {
  ignores(absolutePath: string): boolean;
}

async function readPatternsFromFile(path: string): Promise<string[]> {
  try {
    const contents = await readFile(path, "utf8");
    return contents.split(/\r?\n/);
  } catch {
    return [];
  }
}

function toPosixRelative(workspaceRoot: string, absolutePath: string): string | null {
  const rel = relative(workspaceRoot, absolutePath);

  if (rel === "" || rel.startsWith("..") || rel === "..") {
    return null;
  }

  return rel.split(sep).join("/");
}

export async function createWorkspaceIgnore(workspaceRoot: string): Promise<WorkspaceIgnore> {
  const matcher: Ignore = ignore();
  matcher.add(DEFAULT_PATTERNS);

  for (const filename of IGNORE_FILES) {
    const patterns = await readPatternsFromFile(join(workspaceRoot, filename));

    if (patterns.length > 0) {
      matcher.add(patterns);
    }
  }

  return {
    ignores(absolutePath: string): boolean {
      const relativePath = toPosixRelative(workspaceRoot, absolutePath);

      if (relativePath === null) {
        return false;
      }

      return matcher.ignores(relativePath);
    },
  };
}
