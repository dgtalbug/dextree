import { build } from "esbuild";
import { constants } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "../..");
const distDir = resolve(packageDir, "dist");

const assetMatrix = [
  {
    target: "tree-sitter.wasm",
    candidates: [resolve(repoRoot, "node_modules/web-tree-sitter/tree-sitter.wasm")],
  },
  {
    target: "tree-sitter-typescript.wasm",
    candidates: [
      resolve(repoRoot, "node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm"),
      resolve(
        repoRoot,
        "node_modules/tree-sitter-typescript/bindings/node/tree-sitter-typescript.wasm",
      ),
    ],
  },
  {
    target: "duckdb-binding.node",
    candidates: [
      resolve(repoRoot, "node_modules/@duckdb/node-api/dist/duckdb.node"),
      resolve(repoRoot, "node_modules/@duckdb/node-api/dist/duckdb-binding.node"),
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

async function copyOptionalAsset(target, candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      await copyFile(candidate, resolve(distDir, target));
      return;
    }
  }

  console.warn(`[dextree:extension] Optional asset not found for ${target}`);
}

async function bundleExtension() {
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [resolve(packageDir, "src/extension.ts")],
    outfile: resolve(distDir, "extension.cjs"),
    bundle: true,
    external: ["vscode", "@dextree/core"],
    format: "cjs",
    platform: "node",
    sourcemap: true,
    target: "node22",
  });

  await Promise.all(assetMatrix.map((asset) => copyOptionalAsset(asset.target, asset.candidates)));
}

bundleExtension().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
