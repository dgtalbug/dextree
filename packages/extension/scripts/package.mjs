// Build the .vsix via vsce, passing through --target when VSCE_TARGET is set.
// VSCE_TARGET is set by the release matrix workflow (e.g. darwin-arm64); when
// unset (local dev) we produce an untargeted .vsix.

import { spawnSync } from "node:child_process";

const target = process.env.VSCE_TARGET || "";
const args = ["package", "--no-dependencies"];
if (target) args.push("--target", target);

const bin = process.platform === "win32" ? "vsce.cmd" : "vsce";
const result = spawnSync(bin, args, { stdio: "inherit", shell: false });

if (result.error) {
  console.error(`Failed to spawn ${bin}:`, result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
