import { build, context } from "esbuild";
import { constants, readdirSync } from "node:fs";
import { access, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../..");
const distDir = resolve(packageDir, "dist");

// When VSCE_TARGET is set (release matrix), bundle only that platform's DuckDB
// binding so each .vsix stays under the Marketplace size cap. When unset (local
// dev), bundle every binding that pnpm has actually installed (host platform only
// by default; opt in to others via supportedArchitectures in root package.json).
const VSCE_TARGET = process.env.VSCE_TARGET || "";

/** Find files in the pnpm content-addressable store by package name prefix. */
function pnpmStore(prefix, relativePath) {
  try {
    const pnpmDir = resolve(repoRoot, "node_modules/.pnpm");
    return readdirSync(pnpmDir)
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => resolve(pnpmDir, entry, "node_modules", relativePath));
  } catch {
    return [];
  }
}

/** Platforms @duckdb/node-api ships optional native bindings for. */
const DUCKDB_PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];

const assetMatrix = [
  {
    // web-tree-sitter v0.20+ renamed tree-sitter.wasm → web-tree-sitter.wasm
    target: "web-tree-sitter/web-tree-sitter.wasm",
    candidates: [
      resolve(repoRoot, "node_modules/web-tree-sitter/web-tree-sitter.wasm"),
      ...pnpmStore("web-tree-sitter@", "web-tree-sitter/web-tree-sitter.wasm"),
    ],
  },
  {
    target: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    candidates: [
      resolve(repoRoot, "node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm"),
      resolve(
        repoRoot,
        "node_modules/tree-sitter-typescript/bindings/node/tree-sitter-typescript.wasm",
      ),
      ...pnpmStore("tree-sitter-typescript@", "tree-sitter-typescript/tree-sitter-typescript.wasm"),
    ],
  },
  {
    // TSX grammar ships alongside the TypeScript grammar; used for .tsx files.
    target: "tree-sitter-typescript/tree-sitter-tsx.wasm",
    candidates: [
      resolve(repoRoot, "node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm"),
      ...pnpmStore("tree-sitter-typescript@", "tree-sitter-typescript/tree-sitter-tsx.wasm"),
    ],
  },
  {
    target: "tree-sitter-javascript/tree-sitter-javascript.wasm",
    candidates: [
      resolve(repoRoot, "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm"),
      ...pnpmStore("tree-sitter-javascript@", "tree-sitter-javascript/tree-sitter-javascript.wasm"),
    ],
  },
  // Copy each platform's DuckDB native binding. Each entry is tagged with its
  // platform so VSCE_TARGET can filter to a single one in matrix release builds.
  ...DUCKDB_PLATFORMS.map((platform) => ({
    platform,
    target: `duckdb-${platform}.node`,
    silent: true,
    candidates: [
      resolve(repoRoot, `node_modules/@duckdb/node-bindings-${platform}/duckdb.node`),
      ...pnpmStore(
        `@duckdb+node-bindings-${platform}@`,
        `@duckdb/node-bindings-${platform}/duckdb.node`,
      ),
    ],
  })),
  // Companion dynamic library required by the .node addon at runtime.
  // macOS: duckdb.node has @rpath/libduckdb.dylib baked in — must be in same dir.
  // Linux: libduckdb.so; Windows: duckdb.dll.
  {
    platform: "darwin-arm64",
    target: "libduckdb.dylib",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-darwin-arm64@",
        "@duckdb/node-bindings-darwin-arm64/libduckdb.dylib",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-darwin-arm64/libduckdb.dylib"),
    ],
  },
  {
    platform: "darwin-x64",
    target: "libduckdb.dylib",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-darwin-x64@",
        "@duckdb/node-bindings-darwin-x64/libduckdb.dylib",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-darwin-x64/libduckdb.dylib"),
    ],
  },
  {
    platform: "linux-arm64",
    target: "libduckdb.so",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-linux-arm64@",
        "@duckdb/node-bindings-linux-arm64/libduckdb.so",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-linux-arm64/libduckdb.so"),
    ],
  },
  {
    platform: "linux-x64",
    target: "libduckdb.so",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-linux-x64@",
        "@duckdb/node-bindings-linux-x64/libduckdb.so",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-linux-x64/libduckdb.so"),
    ],
  },
  {
    platform: "win32-arm64",
    target: "duckdb.dll",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-win32-arm64@",
        "@duckdb/node-bindings-win32-arm64/duckdb.dll",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-win32-arm64/duckdb.dll"),
    ],
  },
  {
    platform: "win32-x64",
    target: "duckdb.dll",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-win32-x64@",
        "@duckdb/node-bindings-win32-x64/duckdb.dll",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-win32-x64/duckdb.dll"),
    ],
  },
  // Codicons font and CSS for webview panel
  {
    target: "codicons/codicon.css",
    candidates: [
      resolve(repoRoot, "node_modules/@vscode/codicons/dist/codicon.css"),
      ...pnpmStore("@vscode+codicons@", "@vscode/codicons/dist/codicon.css"),
    ],
  },
  {
    target: "codicons/codicon.ttf",
    candidates: [
      resolve(repoRoot, "node_modules/@vscode/codicons/dist/codicon.ttf"),
      ...pnpmStore("@vscode+codicons@", "@vscode/codicons/dist/codicon.ttf"),
    ],
  },
];

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyOptionalAsset(target, candidates, silent = false) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      const dest = resolve(distDir, target);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(candidate, dest);
      return;
    }
  }

  if (!silent) console.warn(`[dextree:extension] Optional asset not found for ${target}`);
}

async function cleanStaleDuckdbAssets() {
  // Remove every platform's DuckDB binary before each build. Without this, a
  // dev who builds for darwin-arm64 and then for linux-x64 in the same dist/
  // would end up with both — and the unsuffixed legacy `duckdb-binding.node`
  // file from old builds would also linger. We want each .vsix to contain
  // exactly one platform's binaries.
  const stale = [
    "duckdb-binding.node",
    ...DUCKDB_PLATFORMS.map((p) => `duckdb-${p}.node`),
    "libduckdb.dylib",
    "libduckdb.so",
    "duckdb.dll",
  ];
  await Promise.all(stale.map((file) => rm(resolve(distDir, file), { force: true })));
}

async function copyAssets() {
  await cleanStaleDuckdbAssets();

  // VSCE_TARGET filter: in matrix release builds, only the asset entries for the
  // current target (or platform-agnostic entries with no `platform` tag) are copied.
  const filtered = VSCE_TARGET
    ? assetMatrix.filter((asset) => !asset.platform || asset.platform === VSCE_TARGET)
    : assetMatrix;

  await Promise.all(
    filtered.map((asset) => copyOptionalAsset(asset.target, asset.candidates, asset.silent)),
  );
}

function copyAssetsPlugin(watchMode = false) {
  return {
    name: "copy-assets",
    setup(buildContext) {
      buildContext.onEnd(async (result) => {
        if (result.errors.length > 0) {
          if (watchMode) {
            console.error("[dextree:extension] host build failed");
          }
          return;
        }

        await copyAssets();

        if (watchMode) {
          console.log("[dextree:extension] host ready");
        }
      });
    },
  };
}

/**
 * esbuild plugin that replaces @duckdb/node-bindings-{platform} package requires
 * with a shim that loads the native binary from the dist/ directory using a
 * relative require. This makes the bundle self-contained without needing node_modules.
 */
const duckdbNativePlugin = {
  name: "duckdb-native",
  setup(build) {
    build.onResolve({ filter: /^@duckdb\/node-bindings-/ }, (args) => ({
      path: args.path,
      namespace: "duckdb-native",
    }));

    build.onLoad({ filter: /.*/, namespace: "duckdb-native" }, (args) => {
      const match = args.path.match(/@duckdb\/node-bindings-([^/]+)/);
      const platform = match ? match[1] : "unknown";
      // Relative to dist/extension.cjs → picks up dist/duckdb-{platform}.node
      return {
        contents: `module.exports = require('./duckdb-${platform}.node');`,
        loader: "js",
      };
    });
  },
};

function createBuildOptions(watchMode = false) {
  return {
    entryPoints: [resolve(packageDir, "src/extension.ts")],
    outfile: resolve(distDir, "extension.cjs"),
    bundle: true,
    external: ["vscode", "*.node"],
    plugins: [duckdbNativePlugin, copyAssetsPlugin(watchMode)],
    format: "cjs",
    platform: "node",
    sourcemap: true,
    target: "node22",
    // web-tree-sitter@0.26.x is an ESM package that calls createRequire(import.meta.url)
    // during module initialisation. esbuild stubs import.meta as {} by default, making
    // import.meta.url === undefined and causing a TypeError before our locateFile hook
    // can ever run.
    //
    // Fix: inject a top-level variable that resolves to this CJS bundle's own file URL
    // (banner), then replace every import.meta.url reference with that variable (define).
    // define only accepts identifiers, so the runtime expression lives in the banner.
    banner: {
      js: 'const __importMetaUrl=require("url").pathToFileURL(__filename).href;',
    },
    define: {
      "import.meta.url": "__importMetaUrl",
    },
  };
}

async function bundleExtension(watchMode = false) {
  await mkdir(distDir, { recursive: true });

  if (watchMode) {
    console.log("[dextree:extension] host watch starting");
    const watchContext = await context(createBuildOptions(true));
    await watchContext.watch();
    return;
  }

  await build(createBuildOptions(false));
}

const watchMode = process.argv.includes("--watch");

bundleExtension(watchMode).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
