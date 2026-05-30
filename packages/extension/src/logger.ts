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

  debug(message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    this.outputChannel.appendLine(`[Dextree] ${message}${suffix}`);
  }

  info(message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    this.outputChannel.appendLine(`[Dextree] ${message}${suffix}`);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    this.outputChannel.appendLine(`[Dextree] WARN ${message}${suffix}`);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const contextSuffix = context ? ` ${JSON.stringify(context)}` : "";
    const suffix =
      error instanceof Error
        ? `: ${error.message}${error.stack ? `\n  ${error.stack.split("\n").slice(0, 3).join("\n  ")}` : ""}`
        : error !== undefined
          ? `: ${String(error)}`
          : "";
    this.outputChannel.appendLine(`[Dextree] ERROR ${message}${suffix}${contextSuffix}`);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function createLogger(outputChannel: OutputChannel): Logger {
  return new OutputChannelLogger(outputChannel);
}
