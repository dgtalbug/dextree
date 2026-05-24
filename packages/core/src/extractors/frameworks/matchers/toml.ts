/**
 * Minimal TOML keypath reader. Returns the string value at a dot-separated
 * keypath, or undefined if missing. Handles `[section]` and `[section.sub]`
 * headers, plus `key = "value"` and `key = value` lines. Comments (`#`) are
 * ignored. Arrays-of-tables (`[[name]]`) are out of scope for slice 018;
 * if a framework needs them, upgrade to a library and keep the contract.
 *
 * Why inline: we only need keypath lookup. A full TOML parser is ~5 KB
 * of dependency surface we don't otherwise use.
 */
export function readTomlKeypath(content: string, keypath: string): string | undefined {
  const targetParts = keypath.split(".");
  const targetKey = targetParts[targetParts.length - 1];
  const targetSection = targetParts.slice(0, -1).join(".");

  if (targetKey === undefined) {
    return undefined;
  }

  let currentSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) {
      continue;
    }

    if (line.startsWith("[[")) {
      // Array-of-tables not supported in this slice; skip the section.
      currentSection = "__unsupported__";
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      continue;
    }

    if (currentSection !== targetSection) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex < 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (key !== targetKey) {
      continue;
    }

    return unquote(line.slice(eqIndex + 1).trim());
  }

  return undefined;
}

function stripComment(line: string): string {
  // Find the first `#` that is not inside a quoted string.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
