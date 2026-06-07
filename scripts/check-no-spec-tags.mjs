#!/usr/bin/env node
// Fails if spec/process-tracking tags leak into shipped source. Such tags
// (FR-013, T042, "slice-7", "per D2", CodeRabbit, …) are traceability metadata
// that belongs in specs/PRs, never inline in code (CLAUDE.md "Comments policy").
//
// Test-support dirs are exempt: a fixture or fuzz corpus may legitimately *name*
// the requirement it pins. The exemption matches the policy's intent ("no tags
// in shipped source"), not the mechanical "is it a .test file" proxy.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SRC_GLOBS = ["packages"];
const FILE_EXT = /\.tsx?$/;

// Dirs/files that are test-support, not shipped source.
const EXEMPT_SEGMENT = /(^|\/)(__fixtures__|__fuzz__|__mocks__|node_modules|dist)(\/|$)/;
const EXEMPT_FILE = /\.(test|spec|fuzz)\.tsx?$/;

// The 0.2 snapshot pattern. Each alternative is a tracking-tag shape, not prose.
const TAG = new RegExp(
  [
    "FR-[0-9]",
    "TR-[0-9]",
    "US-?[0-9]",
    "SPEC-[0-9]",
    "Slice [0-9]",
    "slice-[0-9]",
    "T0[0-9][0-9]",
    "per (FR|D)[0-9]",
    "\\bS[0-9]\\.[0-9]",
    "\\bS8\\b",
    "\\bM7\\b",
    "CodeRabbit",
    "CodeQL",
    "this slice",
    "this PR",
  ].join("|"),
);

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (EXEMPT_SEGMENT.test(rel.replaceAll("\\", "/"))) continue;
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (FILE_EXT.test(entry) && !EXEMPT_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = SRC_GLOBS.flatMap((g) => walk(join(root, g), []));
const hits = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (TAG.test(line)) {
      hits.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (hits.length > 0) {
  console.error(
    `Found ${hits.length} spec/process-tracking tag(s) in shipped source.\n` +
      "Move traceability to the spec/PR; keep only why-comments in code.\n",
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(`No spec-tracking tags found across ${files.length} source files.`);
