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

// Opt-in pattern sets layered on top of the default ignores + ignore files.
// Off by default so current behavior is unchanged until the user asks.
const DOCUMENTATION_PATTERNS = ["**/*.md"];
const TEST_PATTERNS = ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/test/**"];

/** User-facing opt-in toggles, layered onto the default ignore matcher. */
export interface WorkspaceIgnoreOptions {
  /** When true, exclude documentation (`*.md`) from indexing. Default false. */
  readonly ignoreDocumentation?: boolean;
  /** When true, exclude test files from indexing. Default false. */
  readonly ignoreTests?: boolean;
}

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

export async function createWorkspaceIgnore(
  workspaceRoot: string,
  options: WorkspaceIgnoreOptions = {},
): Promise<WorkspaceIgnore> {
  const matcher: Ignore = ignore();
  matcher.add(DEFAULT_PATTERNS);

  for (const filename of IGNORE_FILES) {
    const patterns = await readPatternsFromFile(join(workspaceRoot, filename));

    if (patterns.length > 0) {
      matcher.add(patterns);
    }
  }

  // Opt-in toggles layered last so they extend (never replace) the defaults.
  if (options.ignoreDocumentation === true) {
    matcher.add(DOCUMENTATION_PATTERNS);
  }
  if (options.ignoreTests === true) {
    matcher.add(TEST_PATTERNS);
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
