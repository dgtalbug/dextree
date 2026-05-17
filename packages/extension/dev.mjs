import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDir = dirname(fileURLToPath(import.meta.url));
const hostEntrypoint = resolve(packageDir, "esbuild.mjs");
const viteEntrypoint = resolve(packageDir, "node_modules/vite/bin/vite.js");

const childProcesses = [];
let isShuttingDown = false;
let hostReady = false;
let webviewReady = false;
let devReady = false;

function maybeLogReady() {
  if (!devReady && hostReady && webviewReady) {
    devReady = true;
    console.log("[dextree:extension] dev ready");
  }
}

function forwardOutput(stream, onLine) {
  let buffer = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        console.log(line);
      }

      onLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  });

  stream.on("end", () => {
    const line = buffer.replace(/\r$/, "");
    if (line.length > 0) {
      console.log(line);
      onLine(line);
    }
  });
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const childProcess of childProcesses) {
    if (!childProcess.killed) {
      childProcess.kill("SIGTERM");
    }
  }

  process.exitCode = exitCode;
}

function startWatcher(label, args, onLine) {
  const childProcess = spawn(process.execPath, args, {
    cwd: packageDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  childProcesses.push(childProcess);
  forwardOutput(childProcess.stdout, onLine);
  forwardOutput(childProcess.stderr, onLine);

  childProcess.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[dextree:extension] ${label} stopped with ${signal}`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`[dextree:extension] ${label} exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dextree:extension] starting dev watchers");

startWatcher("host watcher", [hostEntrypoint, "--watch"], (line) => {
  if (line.includes("[dextree:extension] host ready")) {
    hostReady = true;
    maybeLogReady();
  }
});

startWatcher("webview watcher", [viteEntrypoint, "build", "--watch"], (line) => {
  if (line.includes("watching for file changes")) {
    webviewReady = true;
    maybeLogReady();
  }
});
