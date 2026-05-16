import { build } from "esbuild";
import { constants, readdirSync } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../..");
const distDir = resolve(packageDir, "dist");

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
  // Copy each platform's DuckDB native binding; only the host platform's binary will exist.
  ...DUCKDB_PLATFORMS.map((platform) => ({
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
  // Copy companion dynamic library required by the .node addon at runtime.
  // macOS: duckdb.node has @rpath/libduckdb.dylib baked in — must be in same dir.
  // Linux: libduckdb.so; Windows: duckdb.dll.
  {
    target: "libduckdb.dylib",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-darwin-arm64@",
        "@duckdb/node-bindings-darwin-arm64/libduckdb.dylib",
      ),
      ...pnpmStore(
        "@duckdb+node-bindings-darwin-x64@",
        "@duckdb/node-bindings-darwin-x64/libduckdb.dylib",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-darwin-arm64/libduckdb.dylib"),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-darwin-x64/libduckdb.dylib"),
    ],
  },
  {
    target: "libduckdb.so",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-linux-arm64@",
        "@duckdb/node-bindings-linux-arm64/libduckdb.so",
      ),
      ...pnpmStore(
        "@duckdb+node-bindings-linux-x64@",
        "@duckdb/node-bindings-linux-x64/libduckdb.so",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-linux-arm64/libduckdb.so"),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-linux-x64/libduckdb.so"),
    ],
  },
  {
    target: "duckdb.dll",
    silent: true,
    candidates: [
      ...pnpmStore(
        "@duckdb+node-bindings-win32-arm64@",
        "@duckdb/node-bindings-win32-arm64/duckdb.dll",
      ),
      ...pnpmStore(
        "@duckdb+node-bindings-win32-x64@",
        "@duckdb/node-bindings-win32-x64/duckdb.dll",
      ),
      resolve(repoRoot, "node_modules/@duckdb/node-bindings-win32-arm64/duckdb.dll"),
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

async function bundleExtension() {
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [resolve(packageDir, "src/extension.ts")],
    outfile: resolve(distDir, "extension.cjs"),
    bundle: true,
    external: ["vscode", "*.node"],
    plugins: [duckdbNativePlugin],
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
  });

  await Promise.all(
    assetMatrix.map((asset) => copyOptionalAsset(asset.target, asset.candidates, asset.silent)),
  );
}

bundleExtension().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
