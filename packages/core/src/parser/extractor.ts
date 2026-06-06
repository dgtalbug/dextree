import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { v4 as uuidv4 } from "uuid";
import type { Node } from "web-tree-sitter";

import type { ExtractedImportRef, ExtractedIndexData, SymbolRange } from "../types.js";

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".js": "javascript",
  ".tsx": "typescriptreact",
  ".jsx": "javascriptreact",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".rs": "rust",
  ".md": "markdown",
  ".mjs": "javascript",
  ".cjs": "javascript",
};

export function detectLanguage(absolutePath: string): string {
  return LANGUAGE_BY_EXTENSION[extname(absolutePath).toLowerCase()] ?? "plaintext";
}

const IMPORT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

function toPosixRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

function isWithinWorkspace(workspaceRoot: string, absolutePath: string): boolean {
  const relativePath = relative(workspaceRoot, absolutePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function getLoc(source: string): number {
  return source.split("\n").length;
}

function toRange(node: Node): SymbolRange {
  return {
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
  };
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function importCandidates(importerAbsolutePath: string, specifier: string): string[] {
  const importerDir = dirname(importerAbsolutePath);
  const basePath = resolve(importerDir, specifier);

  if (extname(basePath) !== "") {
    return [basePath];
  }

  return [
    ...IMPORT_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...IMPORT_EXTENSIONS.map((extension) => join(basePath, `index${extension}`)),
  ];
}

async function resolveImportPath(
  importerAbsolutePath: string,
  workspaceRoot: string,
  specifier: string,
): Promise<string | null> {
  if (specifier.startsWith(".")) {
    for (const candidate of importCandidates(importerAbsolutePath, specifier)) {
      if (!(await fileExists(candidate))) continue;
      if (!isWithinWorkspace(workspaceRoot, candidate)) continue;
      return toPosixRelativePath(workspaceRoot, candidate);
    }
    return null;
  }

  // Non-relative: try tsconfig path alias expansion (e.g. @/* → src/*).
  const aliases = await loadPathAliases(workspaceRoot);
  for (const [prefix, targets] of aliases) {
    // prefix is e.g. "@/*"; strip trailing "*" to get the alias stem.
    const stem = prefix.endsWith("/*") ? prefix.slice(0, -2) : prefix;
    if (!specifier.startsWith(stem)) continue;
    const remainder = specifier.slice(stem.length);
    for (const target of targets) {
      // target is e.g. "src/*" or "./src/*"
      const targetBase = target.endsWith("/*") ? target.slice(0, -2) : target;
      const expanded = join(workspaceRoot, targetBase) + remainder;
      for (const candidate of expandedCandidates(expanded)) {
        if (!(await fileExists(candidate))) continue;
        if (!isWithinWorkspace(workspaceRoot, candidate)) continue;
        return toPosixRelativePath(workspaceRoot, candidate);
      }
    }
  }

  return null;
}

/** Candidates when we have an already-resolved absolute base path (no extension). */
function expandedCandidates(basePath: string): string[] {
  if (extname(basePath) !== "") return [basePath];
  return [
    ...IMPORT_EXTENSIONS.map((ext) => `${basePath}${ext}`),
    ...IMPORT_EXTENSIONS.map((ext) => join(basePath, `index${ext}`)),
  ];
}

/** Per-workspace-root cache of tsconfig `compilerOptions.paths` alias mappings. */
const pathAliasCache = new Map<string, Map<string, string[]>>();

/** Candidate tsconfig filenames to probe, in preference order. */
const TSCONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.base.json", "tsconfig.webview.json"];

type TsConfigShape = {
  compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string };
  extends?: string;
};

async function parseTsConfigFile(filePath: string): Promise<TsConfigShape | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    // Strip single-line comments before parsing (tsconfig allows them).
    const stripped = raw.replace(/\/\/[^\n]*/g, "");
    return JSON.parse(stripped) as TsConfigShape;
  } catch {
    return null;
  }
}

async function loadPathAliases(workspaceRoot: string): Promise<Map<string, string[]>> {
  if (pathAliasCache.has(workspaceRoot)) {
    return pathAliasCache.get(workspaceRoot)!;
  }
  const result = new Map<string, string[]>();

  for (const candidate of TSCONFIG_CANDIDATES) {
    const tsconfigPath = join(workspaceRoot, candidate);
    const parsed = await parseTsConfigFile(tsconfigPath);
    if (parsed === null) continue;

    // Follow `extends` chain (one level) to pick up base configs.
    if (typeof parsed.extends === "string") {
      const parentPath = resolve(dirname(tsconfigPath), parsed.extends);
      const parentCandidates = [parentPath, `${parentPath}.json`];
      for (const p of parentCandidates) {
        const parent = await parseTsConfigFile(p);
        if (parent?.compilerOptions?.paths) {
          for (const [alias, targets] of Object.entries(parent.compilerOptions.paths)) {
            if (Array.isArray(targets) && !result.has(alias)) {
              result.set(alias, targets as string[]);
            }
          }
        }
      }
    }

    const paths = parsed?.compilerOptions?.paths;
    if (paths !== null && typeof paths === "object") {
      for (const [alias, targets] of Object.entries(paths)) {
        if (Array.isArray(targets)) result.set(alias, targets as string[]);
      }
    }

    // Stop at the first tsconfig that exists (even if it has no paths).
    break;
  }

  pathAliasCache.set(workspaceRoot, result);
  return result;
}

export async function extractImportRefs(
  rootChildren: readonly Node[],
  absolutePath: string,
  workspaceRoot: string,
  fileId: string,
): Promise<ExtractedImportRef[]> {
  const imports: ExtractedImportRef[] = [];

  for (const child of rootChildren) {
    if (child.type !== "import_statement") {
      continue;
    }

    const match = child.text.match(/["']([^"']+)["']/);
    const specifier = match?.[1];

    if (specifier === undefined) {
      continue;
    }

    const importPath = await resolveImportPath(absolutePath, workspaceRoot, specifier);

    if (importPath === null) {
      continue;
    }

    imports.push({
      id: uuidv4(),
      fileId,
      importPath,
      importedSymbol: null,
      range: toRange(child),
      language: "typescript",
    });
  }

  return imports;
}

export async function extractPlainFile(
  absolutePath: string,
  workspaceRoot: string,
): Promise<ExtractedIndexData> {
  const source = await readFile(absolutePath, "utf8");
  const fileId = uuidv4();
  const relativePath = toPosixRelativePath(workspaceRoot, absolutePath);
  return {
    file: {
      id: fileId,
      path: absolutePath,
      relativePath,
      language: detectLanguage(absolutePath),
      loc: getLoc(source),
      hash: hashSource(source),
    },
    symbols: [],
    imports: [],
  };
}
