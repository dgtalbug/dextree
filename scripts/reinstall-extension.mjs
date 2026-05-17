import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const extensionDir = join(repoRoot, "packages", "extension");
const extensionPackage = JSON.parse(readFileSync(join(extensionDir, "package.json"), "utf8"));

const options = parseOptions(process.argv.slice(2));
const cliCommand = resolveCliCommand(options.cliCommand, process.env.VSCODE_CLI);

run("pnpm", ["package"], repoRoot);

const vsixPath = findLatestVsix(extensionDir, extensionPackage.name);
run(cliCommand, ["--install-extension", vsixPath, "--force"], repoRoot);

const reloadedWindow = options.reloadWindow
  ? tryReloadWindow(resolveAppName(options.appName, cliCommand, process.env.VSCODE_APP_NAME))
  : false;

console.log(
  `Reinstalled ${extensionPackage.publisher}.${extensionPackage.name} from ${relative(repoRoot, vsixPath)} using ${cliCommand}.`,
);
if (reloadedWindow) {
  console.log(
    "Requested a VS Code window reload so the running extension host picks up the new build.",
  );
} else {
  console.log(
    "Reload the VS Code window if the running extension host does not pick up the new build automatically.",
  );
}

function parseOptions(argv) {
  const options = {
    appName: undefined,
    cliCommand: undefined,
    reloadWindow: process.platform === "darwin",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--cli") {
      options.cliCommand = argv[index + 1];
      index += 1;
      if (!options.cliCommand) {
        fail("Missing value for --cli. Example: pnpm extension:reinstall -- --cli code-insiders");
      }
      continue;
    }

    if (arg === "--app") {
      options.appName = argv[index + 1];
      index += 1;
      if (!options.appName) {
        fail(
          "Missing value for --app. Example: pnpm extension:reinstall -- --app 'Visual Studio Code - Insiders'",
        );
      }
      continue;
    }

    if (arg === "--reload") {
      options.reloadWindow = true;
      continue;
    }

    if (arg === "--no-reload") {
      options.reloadWindow = false;
      continue;
    }

    if (arg === "--help") {
      console.log(
        "Usage: pnpm extension:reinstall -- [--cli <command>] [--app <macOS app name>] [--reload|--no-reload]",
      );
      process.exit(0);
    }

    fail(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveCliCommand(cliArg, envCli) {
  if (cliArg) {
    return cliArg;
  }

  if (envCli) {
    return envCli;
  }

  for (const candidate of ["code", "code-insiders", "codium"]) {
    if (canRun(candidate)) {
      return candidate;
    }
  }

  fail(
    "Unable to find a VS Code CLI. Install the `code` shell command or pass `--cli <command>` / set VSCODE_CLI.",
  );
}

function resolveAppName(appArg, cliCommand, envAppName) {
  if (appArg) {
    return appArg;
  }

  if (envAppName) {
    return envAppName;
  }

  const cliBaseName = basename(cliCommand).toLowerCase();
  if (cliBaseName === "code") {
    return "Visual Studio Code";
  }

  if (cliBaseName === "code-insiders") {
    return "Visual Studio Code - Insiders";
  }

  if (cliBaseName === "codium") {
    return "VSCodium";
  }

  return undefined;
}

function canRun(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function findLatestVsix(directory, extensionName) {
  const matches = readdirSync(directory)
    .filter((entry) => entry.startsWith(`${extensionName}-`) && entry.endsWith(".vsix"))
    .map((entry) => {
      const filePath = join(directory, entry);
      return { filePath, modifiedTime: statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.modifiedTime - left.modifiedTime);

  const latestMatch = matches[0];
  if (!latestMatch) {
    fail(`Could not find a packaged VSIX in ${directory}.`);
  }

  return latestMatch.filePath;
}

function tryReloadWindow(appName) {
  if (process.platform !== "darwin") {
    return false;
  }

  if (!appName) {
    console.warn(
      "Installed the new VSIX, but automatic reload was skipped because the macOS app name could not be inferred. Pass --app or set VSCODE_APP_NAME.",
    );
    return false;
  }

  const result = spawnSync(
    "osascript",
    [
      "-e",
      `tell application \"${escapeAppleScript(appName)}\" to activate`,
      "-e",
      "delay 0.2",
      "-e",
      'tell application "System Events" to keystroke "r" using command down',
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    console.warn(
      `Installed the new VSIX, but automatic reload failed${detail ? `: ${detail}` : ". Run Developer: Reload Window manually."}`,
    );
    return false;
  }

  return true;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function escapeAppleScript(value) {
  return value.replaceAll('"', '\\"');
}
