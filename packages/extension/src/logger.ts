import type { OutputChannel } from "vscode";

export interface Logger {
  debug(message: string): void;
  error(message: string, error?: unknown): void;
  dispose(): void;
}

class OutputChannelLogger implements Logger {
  constructor(private readonly outputChannel: OutputChannel) {}

  debug(message: string): void {
    this.outputChannel.appendLine(`[Dextree] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error instanceof Error ? `: ${error.message}` : "";
    this.outputChannel.appendLine(`[Dextree] ERROR ${message}${suffix}`);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function createLogger(outputChannel: OutputChannel): Logger {
  return new OutputChannelLogger(outputChannel);
}
