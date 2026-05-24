import type { ManifestKeyPath, ManifestMatchPolicy } from "../types.js";
import { readTomlKeypath } from "./toml.js";

export interface ManifestMatcherIO {
  readFile: (relativePath: string) => Promise<string | null>;
}

/**
 * Try to match a single ManifestKeyPath. Returns false when the manifest is
 * missing, unreadable, or the keypath does not resolve. Does not throw.
 */
export async function tryMatchManifest(
  keyPath: ManifestKeyPath,
  io: ManifestMatcherIO,
): Promise<boolean> {
  let content: string | null = null;
  try {
    content = await io.readFile(keyPath.file);
  } catch {
    return false;
  }
  if (content === null) {
    return false;
  }

  const value = extractValue(content, keyPath);
  if (value === undefined) {
    return false;
  }
  return applyPolicy(value, keyPath.match);
}

/**
 * Try the first matching entry from a list. Used when a framework can be
 * detected from any of several manifest files (e.g. requirements.txt OR
 * pyproject.toml).
 */
export async function tryMatchAnyManifest(
  keyPaths: ManifestKeyPath | readonly ManifestKeyPath[],
  io: ManifestMatcherIO,
): Promise<boolean> {
  const list = Array.isArray(keyPaths) ? keyPaths : [keyPaths as ManifestKeyPath];
  for (const kp of list) {
    if (await tryMatchManifest(kp, io)) return true;
  }
  return false;
}

function extractValue(content: string, keyPath: ManifestKeyPath): string | undefined {
  const lower = keyPath.file.toLowerCase();
  if (lower.endsWith(".json")) {
    return readJsonKeypath(content, keyPath.keypath);
  }
  if (lower.endsWith(".toml") || lower === "go.mod") {
    // go.mod is technically not TOML, but its `require ( ... )` blocks are
    // matched by a different path — for slice 018 we treat the whole file as
    // text and rely on the regex policy. The TOML reader will return
    // undefined for go.mod, so we fall through to whole-file regex below.
    const tomlValue = readTomlKeypath(content, keyPath.keypath);
    if (tomlValue !== undefined) return tomlValue;
  }
  if (keyPath.keypath === "__raw__") {
    return content;
  }
  return undefined;
}

function readJsonKeypath(content: string, keypath: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  let cursor: unknown = parsed;
  for (const segment of keypath.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
    if (cursor === undefined) return undefined;
  }
  if (typeof cursor === "string") return cursor;
  if (typeof cursor === "number" || typeof cursor === "boolean") return String(cursor);
  if (cursor === null) return undefined;
  // For "present" policy the caller only needs to know whether the value
  // exists; return a sentinel.
  return "__present__";
}

function applyPolicy(value: string, policy: ManifestMatchPolicy): boolean {
  switch (policy.kind) {
    case "present":
      return true;
    case "regex":
      try {
        return new RegExp(policy.pattern).test(value);
      } catch {
        return false;
      }
    case "equals":
      return value === policy.value;
  }
}
