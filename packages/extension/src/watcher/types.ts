import type { Indexer } from "@dextree/core";
import type * as vscode from "vscode";
import type { Logger } from "../logger.js";

export type WatcherEventKind = "change" | "create" | "delete";

export interface WatcherEvent {
  kind: WatcherEventKind;
  uri: vscode.Uri;
  enqueuedAt: number;
}

export interface WorkspaceWatcherDependencies {
  workspaceRoot: string;
  getIndexer: () => Promise<Indexer>;
  onIndexed: () => void;
  isWorkspaceIndexing: () => boolean;
  logger: Logger;
}
