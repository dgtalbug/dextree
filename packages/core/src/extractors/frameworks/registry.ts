/**
 * ============================================================================
 * FRAMEWORK_REGISTRY — hardcoded, self-documenting framework detection.
 * ============================================================================
 *
 * # Data shape
 *
 * Each entry is a `FrameworkDefinition` (see `./types.ts`):
 *
 *   - name:        stable kebab-case identifier (persisted as
 *                  workspace_framework.framework_name — immutable once shipped).
 *   - description: human-readable; not persisted.
 *   - category:    optional grouping ("ui-framework" | "test-framework" |
 *                  "web-framework" | "ide-extension" | "cli-framework" | …).
 *   - manifest:    one or more `ManifestKeyPath` rules. Detection requires at
 *                  least one manifest match.
 *   - structural:  one `StructuralSignal`. Detection requires this AND
 *                  manifest to fire — both signals are needed (FR-003).
 *   - fileRole:    pure (filePath, fileContent) → role | null. Returns the
 *                  per-file role attribution for files in workspaces where
 *                  this framework was detected.
 *   - knownRoles:  the set of role strings `fileRole` may emit. Tests assert
 *                  drift (typos, accidentally added roles).
 *
 * # Where matchers live
 *
 *   - `./matchers/manifest.ts`   — manifest keypath + match policy
 *   - `./matchers/structural.ts` — glob + content-pattern scan
 *   - `./matchers/toml.ts`       — minimal TOML keypath reader
 *
 * # How to add a new framework
 *
 *   1. Pick a stable kebab-case `name` and decide its `category`.
 *   2. Identify the manifest signal — file (e.g. `package.json` or
 *      `pyproject.toml`), keypath, and match policy (`present` / `regex` /
 *      `equals`). If the dependency can appear in multiple manifests, supply
 *      an array — `tryMatchAnyManifest` checks each in order.
 *   3. Identify the structural signal — a glob (e.g. `**\/*.tsx`) and a
 *      content regex (e.g. `from "react"`). Detection requires this AND
 *      manifest, so keep the pattern specific to reduce false positives.
 *   4. Implement `fileRole(filePath, fileContent)` — return one of the
 *      `knownRoles` strings when the file belongs to this framework, else
 *      `null`. Keep it pure; do not re-read the filesystem.
 *   5. Add a `FrameworkDefinition` entry to `FRAMEWORK_REGISTRY` below.
 *   6. Add a fixture-based test in `./detector.test.ts` that detects the new
 *      framework against a minimal mocked workspace.
 *
 * # Verify
 *
 *   pnpm test --filter @dextree/core
 *
 * The registry test (`./registry.test.ts`) defends this comment block from
 * accidental deletion. If you change the contract, update both the comment
 * and the test.
 * ============================================================================
 */
import type { FrameworkDefinition, FrameworkRegistry } from "./types.js";

const REACT: FrameworkDefinition = {
  name: "react",
  description: "React UI framework",
  category: "ui-framework",
  manifest: [
    {
      file: "package.json",
      keypath: "dependencies.react",
      match: { kind: "present" },
    },
    {
      file: "package.json",
      keypath: "devDependencies.react",
      match: { kind: "present" },
    },
  ],
  structural: {
    fileGlob: "**/*.{tsx,jsx}",
    contentPattern: "from\\s+[\"']react[\"']",
  },
  fileRole: (filePath, fileContent) => {
    if (!/\.(tsx|jsx)$/i.test(filePath)) return null;
    if (/from\s+["']react["']/.test(fileContent)) return "component";
    return null;
  },
  knownRoles: ["component"],
};

const VUE: FrameworkDefinition = {
  name: "vue",
  description: "Vue.js UI framework",
  category: "ui-framework",
  manifest: [
    {
      file: "package.json",
      keypath: "dependencies.vue",
      match: { kind: "present" },
    },
    {
      file: "package.json",
      keypath: "devDependencies.vue",
      match: { kind: "present" },
    },
  ],
  structural: {
    fileGlob: "**/*.vue",
    contentPattern: "<template|<script",
  },
  fileRole: (filePath) => (/\.vue$/i.test(filePath) ? "component" : null),
  knownRoles: ["component"],
};

const VSCODE_EXTENSION: FrameworkDefinition = {
  name: "vscode-extension",
  description: "Visual Studio Code extension",
  category: "ide-extension",
  manifest: {
    file: "package.json",
    keypath: "engines.vscode",
    match: { kind: "present" },
  },
  structural: {
    fileGlob: "**/*.{ts,js}",
    contentPattern: "from\\s+[\"']vscode[\"']",
  },
  fileRole: (_filePath, fileContent) =>
    /from\s+["']vscode["']/.test(fileContent) ? "module" : null,
  knownRoles: ["module"],
};

const VITEST: FrameworkDefinition = {
  name: "vitest",
  description: "Vitest test runner",
  category: "test-framework",
  manifest: [
    {
      file: "package.json",
      keypath: "devDependencies.vitest",
      match: { kind: "present" },
    },
    {
      file: "package.json",
      keypath: "dependencies.vitest",
      match: { kind: "present" },
    },
  ],
  structural: {
    fileGlob: "**/*.{test,spec}.{ts,tsx,js,jsx}",
    contentPattern: "from\\s+[\"']vitest[\"']|describe\\s*\\(|it\\s*\\(",
  },
  fileRole: (filePath) => (/\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(filePath) ? "test" : null),
  knownRoles: ["test"],
};

const JEST: FrameworkDefinition = {
  name: "jest",
  description: "Jest test runner",
  category: "test-framework",
  manifest: [
    {
      file: "package.json",
      keypath: "devDependencies.jest",
      match: { kind: "present" },
    },
    {
      file: "package.json",
      keypath: "dependencies.jest",
      match: { kind: "present" },
    },
  ],
  structural: {
    fileGlob: "**/*.{test,spec}.{ts,tsx,js,jsx}",
    contentPattern: "from\\s+[\"']@jest/|@jest/globals",
  },
  fileRole: (filePath) => (/\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(filePath) ? "test" : null),
  knownRoles: ["test"],
};

const PYTEST: FrameworkDefinition = {
  name: "pytest",
  description: "pytest Python test runner",
  category: "test-framework",
  manifest: [
    {
      file: "pyproject.toml",
      keypath: "tool.poetry.dependencies.pytest",
      match: { kind: "present" },
    },
    {
      file: "requirements.txt",
      keypath: "__raw__",
      match: { kind: "regex", pattern: "(^|\\n)pytest([=<>!~ ]|$)" },
    },
  ],
  structural: {
    fileGlob: "**/test_*.py",
    contentPattern: "^def\\s+test_|import\\s+pytest",
  },
  fileRole: (filePath) => (/test_.*\.py$/i.test(filePath) ? "test" : null),
  knownRoles: ["test"],
};

const EXPRESS: FrameworkDefinition = {
  name: "express",
  description: "Express.js web framework",
  category: "web-framework",
  manifest: [
    {
      file: "package.json",
      keypath: "dependencies.express",
      match: { kind: "present" },
    },
    {
      file: "package.json",
      keypath: "devDependencies.express",
      match: { kind: "present" },
    },
  ],
  structural: {
    fileGlob: "**/*.{ts,js}",
    contentPattern: "from\\s+[\"']express[\"']|require\\([\"']express[\"']\\)",
  },
  fileRole: (_filePath, fileContent) =>
    /app\.(get|post|put|delete|patch|use)\s*\(/.test(fileContent) ? "route-handler" : null,
  knownRoles: ["route-handler"],
};

const FASTAPI: FrameworkDefinition = {
  name: "fastapi",
  description: "FastAPI Python web framework",
  category: "web-framework",
  manifest: [
    {
      file: "pyproject.toml",
      keypath: "tool.poetry.dependencies.fastapi",
      match: { kind: "present" },
    },
    {
      file: "requirements.txt",
      keypath: "__raw__",
      match: { kind: "regex", pattern: "(^|\\n)fastapi([=<>!~ ]|$)" },
    },
  ],
  structural: {
    fileGlob: "**/*.py",
    contentPattern: "from\\s+fastapi\\s+import|FastAPI\\(",
  },
  fileRole: (_filePath, fileContent) =>
    /@(app|router)\.(get|post|put|delete|patch)\s*\(/.test(fileContent) ? "route-handler" : null,
  knownRoles: ["route-handler"],
};

const DJANGO: FrameworkDefinition = {
  name: "django",
  description: "Django Python web framework",
  category: "web-framework",
  manifest: [
    {
      file: "pyproject.toml",
      keypath: "tool.poetry.dependencies.django",
      match: { kind: "present" },
    },
    {
      file: "requirements.txt",
      keypath: "__raw__",
      match: { kind: "regex", pattern: "(^|\\n)[Dd]jango([=<>!~ ]|$)" },
    },
  ],
  structural: {
    fileGlob: "**/*.py",
    contentPattern: "from\\s+django\\.|DJANGO_SETTINGS_MODULE",
  },
  fileRole: (filePath, fileContent) => {
    if (/\/migrations\/.*\.py$/i.test(filePath)) return "migration";
    if (/models\.py$/i.test(filePath)) return "model";
    if (/urls\.py$/i.test(filePath)) return "route-handler";
    if (/from\s+django\./.test(fileContent)) return "module";
    return null;
  },
  knownRoles: ["migration", "model", "route-handler", "module"],
};

const GIN: FrameworkDefinition = {
  name: "gin",
  description: "Gin Go web framework",
  category: "web-framework",
  manifest: {
    file: "go.mod",
    keypath: "__raw__",
    match: { kind: "regex", pattern: "github.com/gin-gonic/gin" },
  },
  structural: {
    fileGlob: "**/*.go",
    contentPattern: '"github.com/gin-gonic/gin"',
  },
  fileRole: (_filePath, fileContent) =>
    /\.(GET|POST|PUT|DELETE|PATCH)\s*\(/.test(fileContent) ? "route-handler" : null,
  knownRoles: ["route-handler"],
};

const COBRA: FrameworkDefinition = {
  name: "cobra",
  description: "Cobra Go CLI framework",
  category: "cli-framework",
  manifest: {
    file: "go.mod",
    keypath: "__raw__",
    match: { kind: "regex", pattern: "github.com/spf13/cobra" },
  },
  structural: {
    fileGlob: "**/*.go",
    contentPattern: '"github.com/spf13/cobra"',
  },
  fileRole: (_filePath, fileContent) => (/cobra\.Command\s*\{/.test(fileContent) ? "module" : null),
  knownRoles: ["module"],
};

export const FRAMEWORK_REGISTRY: FrameworkRegistry = [
  REACT,
  VUE,
  VSCODE_EXTENSION,
  VITEST,
  JEST,
  PYTEST,
  EXPRESS,
  FASTAPI,
  DJANGO,
  GIN,
  COBRA,
];

export type { FrameworkDefinition, FrameworkRegistry } from "./types.js";
