import { createIndexer, type Indexer } from "@dextree/core";
import { join } from "node:path";
import * as vscode from "vscode";

import { createIndexFileCommand } from "./commands/indexFile.js";
import { createLogger, type Logger } from "./logger.js";

let activeIndexer: Indexer | null = null;
let activeLogger: Logger | null = null;

interface ActivationContext {
  subscriptions: { dispose(): void }[];
  storageUri: { fsPath: string } | undefined;
  extensionUri: { fsPath: string };
}

export async function activate(context: ActivationContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Dextree");
  const logger = createLogger(outputChannel);
  activeLogger = logger;

  let indexerPromise: Promise<Indexer> | null = null;

  const getIndexer = async (): Promise<Indexer> => {
    if (indexerPromise !== null) {
      return indexerPromise;
    }

    const storageUri = context.storageUri;

    if (storageUri === undefined) {
      throw new Error("Dextree storage is unavailable for this workspace.");
    }

    indexerPromise = (async () => {
      await vscode.workspace.fs.createDirectory(storageUri as unknown as vscode.Uri);

      const indexer = createIndexer(
        join(storageUri.fsPath, "dextree.db"),
        join(context.extensionUri.fsPath, "dist"),
      );

      activeIndexer = indexer;
      await indexer.initialize();
      return indexer;
    })();

    return indexerPromise;
  };

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(
      "dextree.indexFile",
      createIndexFileCommand({
        context,
        logger,
        getIndexer,
      }),
    ),
  );
}

export async function deactivate(): Promise<void> {
  if (activeIndexer !== null) {
    await activeIndexer.dispose();
    activeIndexer = null;
  }

  if (activeLogger !== null) {
    activeLogger.dispose();
    activeLogger = null;
  }
}
