import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createWorkspaceIgnore } from "@dextree/core";
import * as vscode from "vscode";

import { readIgnoreOptions } from "../commands/ignoreOptions.js";
import { SUPPORTED_GLOB } from "../commands/indexWorkspace.js";
import type { WorkspaceWatcherDependencies, WatcherEvent } from "./types.js";

export type { WorkspaceWatcherDependencies, WatcherEvent } from "./types.js";

const DEBOUNCE_MS = 500;
const MAX_QUEUE_SIZE = 200;

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createWorkspaceWatcher(
  deps: WorkspaceWatcherDependencies,
): vscode.Disposable & { drainQueue(): Promise<void> } {
  const { workspaceRoot, getIndexer, onIndexed, isWorkspaceIndexing, logger } = deps;

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const eventQueue: WatcherEvent[] = [];
  let droppedEventCount = 0;

  // Lazily-initialized ignore helper — createWorkspaceIgnore reads .gitignore files.
  const ignorePromise = createWorkspaceIgnore(workspaceRoot, readIgnoreOptions());

  async function isIgnoredPath(filePath: string): Promise<boolean> {
    const ignore = await ignorePromise;
    return ignore.ignores(filePath);
  }

  async function processEvent(event: WatcherEvent): Promise<void> {
    const filePath = event.uri.fsPath;

    // Silently skip if workspace has not been indexed yet
    try {
      const indexer = await getIndexer();
      const allFiles = await indexer.getAllFiles();
      if (allFiles.length === 0) {
        return;
      }
    } catch {
      return;
    }

    // Skip ignored files
    if (await isIgnoredPath(filePath)) {
      return;
    }

    // Queue events during full workspace indexing
    if (isWorkspaceIndexing()) {
      if (eventQueue.length < MAX_QUEUE_SIZE) {
        eventQueue.push(event);
      } else {
        droppedEventCount++;
        logger?.warn(`[watcher] event dropped (queue full)`, { file: event.uri.fsPath });
      }
      return;
    }

    // Debounce per file path
    const existing = debounceTimers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      filePath,
      setTimeout(() => {
        debounceTimers.delete(filePath);
        void dispatchEvent(event);
      }, DEBOUNCE_MS),
    );
  }

  async function dispatchEvent(event: WatcherEvent): Promise<void> {
    const filePath = event.uri.fsPath;
    const fileName = event.uri.fsPath.split("/").pop() ?? filePath;

    try {
      const indexer = await getIndexer();

      if (event.kind === "delete") {
        await indexer.clearFile(filePath);
        onIndexed();
        logger.debug(`[watcher] removed: ${fileName}`);
        return;
      }

      if (event.kind === "create") {
        await indexer.indexFile(filePath, workspaceRoot);
        onIndexed();
        logger.debug(`[watcher] re-indexed: ${fileName}`);
        return;
      }

      // change: hash-skip if content is unchanged
      let currentContent: string;
      try {
        const buf = await readFile(filePath, "utf8");
        currentContent = buf;
      } catch {
        // File may have been deleted between the event and now; skip silently.
        return;
      }

      const currentHash = hashContent(currentContent);

      const allFiles = await indexer.getAllFiles();
      const stored = allFiles.find((f) => f.path === filePath);
      if (stored !== undefined && stored.hash === currentHash) {
        logger.debug(`[watcher] skipped (unchanged): ${fileName}`);
        return;
      }

      await indexer.indexFile(filePath, workspaceRoot);
      onIndexed();
      logger.debug(`[watcher] re-indexed: ${fileName}`);
    } catch (err) {
      // A failed background re-index leaves the graph stale vs disk — surface it
      // at error level, not debug, so the staleness is diagnosable.
      logger.error(`[watcher] error processing ${fileName}`, err);
    }
  }

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, SUPPORTED_GLOB),
    false,
    false,
    false,
  );

  const onChangeSub = watcher.onDidChange((uri) => {
    void processEvent({ kind: "change", uri, enqueuedAt: Date.now() });
  });
  const onCreateSub = watcher.onDidCreate((uri) => {
    void processEvent({ kind: "create", uri, enqueuedAt: Date.now() });
  });
  const onDeleteSub = watcher.onDidDelete((uri) => {
    void processEvent({ kind: "delete", uri, enqueuedAt: Date.now() });
  });

  async function drainQueue(): Promise<void> {
    const queued = eventQueue.splice(0, eventQueue.length);
    for (const event of queued) {
      await dispatchEvent(event);
    }
    if (droppedEventCount > 0) {
      const count = droppedEventCount;
      droppedEventCount = 0;
      void vscode.window.showInformationMessage(
        `Dextree: ${count} file change(s) were skipped during indexing. Re-index to ensure consistency.`,
      );
    }
  }

  function dispose(): void {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
    onChangeSub.dispose();
    onCreateSub.dispose();
    onDeleteSub.dispose();
    watcher.dispose();
  }

  return { dispose, drainQueue };
}
