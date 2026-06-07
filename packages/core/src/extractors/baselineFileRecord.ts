import { createHash } from "node:crypto";
import { relative, sep } from "node:path";

import { detectLanguage } from "../parser/extractor.js";
import type { ExtractionResult } from "./types.js";

function toPosixRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

/**
 * Builds a minimal file record for files with no language provider (structural /
 * plaintext / a language whose grammar isn't registered yet). The indexer uses
 * this so every file still gets a `file` node even when nothing was extracted.
 */
export function buildBaselineFileRecord(
  absolutePath: string,
  workspaceRoot: string,
  source: string,
  fileId: string,
): ExtractionResult["file"] {
  return {
    id: fileId,
    path: absolutePath,
    relativePath: toPosixRelativePath(workspaceRoot, absolutePath),
    language: detectLanguage(absolutePath),
    loc: source.split("\n").length,
    hash: createHash("sha256").update(source, "utf8").digest("hex"),
  };
}
