/**
 * Global workspace registry for the workspace switcher.
 *
 * Maintains a JSON file under `globalStorageUri` that maps each indexed
 * workspaceRoot to its DuckDB path. This is the only durable way for the
 * extension host to enumerate every workspace it has ever indexed — VS Code's
 * `storageUri` is workspace-scoped and offers no enumeration API.
 */

import { DuckDbForeignGraphReader } from "@dextree/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { IndexedWorkspaceRecord } from "../webview/protocol/messages.js";

export interface WorkspaceRegistryEntry {
  workspaceRoot: string;
  dbPath: string;
  registeredAt: string;
}

export interface WorkspaceRegistry {
  version: 1;
  entries: WorkspaceRegistryEntry[];
}

const REGISTRY_FILE_NAME = "workspace-registry.json";
const EMPTY_REGISTRY: WorkspaceRegistry = { version: 1, entries: [] };

function registryPath(globalStoragePath: string): string {
  return join(globalStoragePath, REGISTRY_FILE_NAME);
}

function isWorkspaceRegistry(value: unknown): value is WorkspaceRegistry {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return r["version"] === 1 && Array.isArray(r["entries"]);
}

/**
 * Reads the global registry. Returns an empty registry if the file is missing,
 * unreadable, or fails the shape check — never throws.
 */
export async function readWorkspaceRegistry(globalStoragePath: string): Promise<WorkspaceRegistry> {
  try {
    const raw = await readFile(registryPath(globalStoragePath), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkspaceRegistry(parsed)) return { ...EMPTY_REGISTRY };
    return parsed;
  } catch {
    return { ...EMPTY_REGISTRY };
  }
}

/**
 * Upserts an entry for the given workspaceRoot+dbPath and writes the registry
 * file. Creates the directory if needed. Existing entries with the same
 * `workspaceRoot` are replaced (deduplication invariant).
 */
export async function registerWorkspace(
  globalStoragePath: string,
  workspaceRoot: string,
  dbPath: string,
): Promise<void> {
  const registry = await readWorkspaceRegistry(globalStoragePath);
  const others = registry.entries.filter((e) => e.workspaceRoot !== workspaceRoot);
  const next: WorkspaceRegistry = {
    version: 1,
    entries: [...others, { workspaceRoot, dbPath, registeredAt: new Date().toISOString() }],
  };

  const path = registryPath(globalStoragePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2), "utf8");
}

/**
 * Resolves every registered workspace to an `IndexedWorkspaceRecord`. Entries
 * whose DB cannot be read are silently excluded — keeps the Workspaces page
 * resilient against deleted or corrupt foreign DBs.
 */
export async function listIndexedWorkspaces(
  globalStoragePath: string,
  activeWorkspaceRoot: string,
): Promise<IndexedWorkspaceRecord[]> {
  const registry = await readWorkspaceRegistry(globalStoragePath);
  const foreignReader = new DuckDbForeignGraphReader();
  const summaries = await Promise.all(
    registry.entries.map(async (entry) => {
      const summary = await foreignReader.readWorkspaceIndexSummary(entry.dbPath);
      if (summary === null) return null;
      const record: IndexedWorkspaceRecord = {
        workspaceRoot: summary.workspaceRoot,
        name: summary.name,
        indexedFileCount: summary.indexedFileCount,
        graphNodeCount: summary.graphNodeCount,
        graphEdgeCount: summary.graphEdgeCount,
        lastIndexedAt: summary.lastIndexedAt,
        frameworks: summary.frameworks,
        isActive: summary.workspaceRoot === activeWorkspaceRoot,
      };
      return record;
    }),
  );

  return summaries.filter((s): s is IndexedWorkspaceRecord => s !== null);
}
