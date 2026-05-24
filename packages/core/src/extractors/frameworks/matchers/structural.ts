import type { StructuralSignal } from "../types.js";

export interface StructuralMatcherIO {
  readFile: (relativePath: string) => Promise<string | null>;
  listFiles: (glob: string) => Promise<readonly string[]>;
}

const DEFAULT_MAX_FILES = 50;

/**
 * Try to detect a structural signal. Lists files matching the glob, reads up
 * to `maxFilesScanned` of them, returns true on first content-pattern match.
 * Unreadable files are skipped, not propagated.
 */
export async function tryMatchStructural(
  signal: StructuralSignal,
  io: StructuralMatcherIO,
): Promise<boolean> {
  let pattern: RegExp;
  try {
    pattern = new RegExp(signal.contentPattern);
  } catch {
    return false;
  }

  let candidates: readonly string[];
  try {
    candidates = await io.listFiles(signal.fileGlob);
  } catch {
    return false;
  }
  if (candidates.length === 0) {
    return false;
  }

  const cap = signal.maxFilesScanned ?? DEFAULT_MAX_FILES;
  const sliced = candidates.slice(0, cap);

  for (const relativePath of sliced) {
    let content: string | null = null;
    try {
      content = await io.readFile(relativePath);
    } catch {
      continue;
    }
    if (content === null) {
      continue;
    }
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}
