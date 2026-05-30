import type { OutputChannel } from "vscode";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  dispose(): void;
}

class OutputChannelLogger implements Logger {
  constructor(private readonly outputChannel: OutputChannel) {}

  debug(message: string): void {
    this.outputChannel.appendLine(`[Dextree] ${message}`);
  }

  info(message: string): void {
    this.outputChannel.appendLine(`[Dextree] ${message}`);
  }

  warn(message: string): void {
    this.outputChannel.appendLine(`[Dextree] WARN ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix =
      error instanceof Error
        ? `: ${error.message}${error.stack ? `\n  ${error.stack.split("\n").slice(0, 3).join("\n  ")}` : ""}`
        : error !== undefined
          ? `: ${String(error)}`
          : "";
    this.outputChannel.appendLine(`[Dextree] ERROR ${message}${suffix}`);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function createLogger(outputChannel: OutputChannel): Logger {
  return new OutputChannelLogger(outputChannel);
}
