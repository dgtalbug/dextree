# Dextree

[![Build](https://github.com/dgtalbug/dextree/actions/workflows/ci.yml/badge.svg)](https://github.com/dgtalbug/dextree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)]()

> Index your codebase into a navigable semantic graph — inside VS Code.

Dextree turns your repository into an interactive knowledge graph. Every symbol, call, import, and dependency is indexed into an embedded graph database (DuckDB + DuckPGQ) and made explorable through a WebGL-rendered visualization directly inside VS Code. Unlike competitors that live outside the editor, Dextree fuses the graph with everything VS Code already knows — LSP type information, live diagnostics, git history, and test linkage — to give you signals no headless tool can produce.

Click any symbol to explore its callers and dependents. Run a blast radius analysis on any git diff or PR to see exactly what a commit could break and which core files are in the impact zone. Export the graph to Mermaid, Obsidian Canvas, PNG, PDF, or SVG. Ask Alfred — Dextree's opt-in LLM layer — to generate architecture overviews, onboarding docs, or PR risk reports from the graph data.

---

## Features

- **Interactive graph view** — WebGL-rendered symbol graph (Sigma.js) inside VS Code. Click any node to jump to definition, expand its neighborhood, or filter by type, language, or quality flag.
- **Two-pass indexing** — Tree-sitter for instant structural extraction (pass 1), LSP-driven semantic enrichment running lazily in the background (pass 2). Graph is usable in under a second.
- **⚡ Blast radius analysis** — point at any branch, commit, or PR number and get a live visualization of what changed, how far the impact propagates through the graph, and which core files are in the blast radius — with a scored risk verdict.
- **Quality signals** — dead code detection, circular imports, complexity metrics, god classes, and security smell flags — all computed as graph properties, not from a separate linter.
- **VS Code data fusion** — the graph is enriched with diagnostics (`vscode.languages.getDiagnostics`), git blame and recency (`vscode.git`), and test linkage (`vscode.tests`). Queries like "most-edited unused public function with type errors and no tests" are a single DuckPGQ statement.
- **Export everywhere** — Mermaid diagrams, Obsidian Canvas JSON, PNG (retina), PDF (vector + narrative), SVG, SCIP (Sourcegraph-compatible).
- **Alfred (opt-in LLM)** — editable markdown prompt templates drive narrative reports: architecture overviews, onboarding guides, PR summaries, dead code reports, blast radius narratives. BYOK, local models supported. Privacy-first — nothing leaves your machine by default.
- **MCP server** — expose the indexed graph to Claude Code, Cursor, and other MCP-compatible agents.
- **Vite-embeddable component** — drop the graph into your project docs site.

---

## Status

**Pre-alpha — v0.1 in active development.**

The extension is not yet available on the VS Code Marketplace. The monorepo scaffold is being established (Slice S0). Follow the progress in [Issues](https://github.com/dgtalbug/dextree/issues).

| Version | Status         | What ships                                             |
| ------- | -------------- | ------------------------------------------------------ |
| v0.1    | 🔨 In progress | Graph view, Tree-sitter indexing, Mermaid export       |
| v0.2    | Planned        | LSP enrichment, diagnostics, git overlay, blast radius |
| v0.3    | Planned        | Canvas, PNG, PDF, SVG, MCP server                      |
| v0.4    | Planned        | Alfred LLM reports                                     |

---

## Installation

> Not yet available. Instructions will be updated when v0.1 ships to the VS Code Marketplace.

When released:

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P` → `ext install dextree`
3. Open a workspace and run `Dextree: Index Workspace`

---

## Usage

> Screenshots and GIFs will be added when the UI is functional (v0.1).

**Commands available (v0.1):**

| Command                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `Dextree: Index Workspace`    | Index the current workspace                         |
| `Dextree: Open Graph View`    | Open the interactive graph webview                  |
| `Dextree: Export as Mermaid`  | Export the current graph view as a `.mmd` file      |
| `Dextree: Show Blast Radius`  | Analyze impact of current branch vs `main` _(v0.2)_ |
| `Dextree: Run Alfred Prompt…` | Run a prompt template against the graph _(v0.4)_    |

---

## Configuration

Key settings (full list in the [design doc](.dextree/design.md) §9.2):

```jsonc
{
  // Indexing
  "dextree.indexing.languages": ["typescript", "javascript", "python"],
  "dextree.indexing.autoIndex": true,

  // Blast radius
  "dextree.blastRadius.coreFanInThreshold": 10,
  "dextree.blastRadius.coreFilePatterns": ["**/auth/**", "**/core/index.*"],
  "dextree.blastRadius.maxHops": 5,

  // Alfred (opt-in LLM — disabled by default)
  "dextree.alfred.enabled": false,
  "dextree.alfred.provider": "anthropic", // anthropic | openai | ollama
  "dextree.alfred.model": "claude-sonnet-4-6",
  // API key stored in VS Code SecretStorage — never in settings
}
```

---

## Development

This project is built fully agentically — Claude Code Workspace handles implementation, GitHub Copilot handles review and docs, GitHub Actions handles CI and release. See [.dextree/build.md](.dextree/build.md) for the full operations manual.

### Prerequisites

- Node.js >= 22.0.0
- pnpm 11.3.0
- VS Code >= 1.85

### Setup

```bash
git clone https://github.com/dgtalbug/dextree
cd dextree
pnpm install
pnpm build
```

### Scripts

```bash
pnpm dev          # watch mode (all packages)
pnpm build        # build all packages
pnpm test         # run all tests (vitest)
pnpm typecheck    # TypeScript check (all packages)
pnpm lint         # ESLint (all packages)
```

### Project structure

```
packages/
  core/        — graph engine (parser, storage, query) — no VS Code deps
  extension/   — VS Code extension (webview, tree view, commands)
  alfred/      — LLM provider abstraction + prompt runner
  exporters/   — Mermaid, Canvas, PNG, PDF, SVG adapters
  mcp/         — MCP server
  cli/         — dextree CLI
  web/         — Vite-embeddable component
.dextree/      — design doc, rules, build playbook, alfred prompts
.specify/      — specs (managed by SpecKit)
.claude/       — Claude Code sub-agent definitions
```

Full architecture: [.dextree/design.md](.dextree/design.md)

### Contributing a slice

1. Read [.dextree/build.md](.dextree/build.md)
2. Find an open issue tagged `type:slice` and `status:specced`
3. Comment `@claude implement this` to trigger the agent, or clone and run locally

---

## Architecture

Dextree uses a two-pass indexing model over a single DuckDB graph:

- **Pass 1** — Tree-sitter WASM parses all files structurally (<1 second for most projects). Graph is immediately usable.
- **Pass 2** — LSP-driven semantic enrichment runs lazily in the background. Type-accurate call edges, resolved references, and framework annotations upgrade the pass-1 graph in place.

Storage: **DuckDB + DuckPGQ** (ISO SQL:2023 graph queries) + **`vss`** (HNSW vector index, opt-in) + **`fts`** (full-text symbol search). One embedded file, no external services.

The real architectural moat is VS Code data fusion: the graph is enriched with live diagnostics, git blame, and test discovery that headless tools can't access. See [.dextree/design.md §6](.dextree/design.md#6-vs-code-data-sources-beyond-tree-sitter--the-moat).

---

## License

MIT © 2026 Bala

---

## Acknowledgements

Built on the shoulders of:

- [Sigma.js](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/) — graph rendering
- [DuckDB](https://duckdb.org/) + [DuckPGQ](https://duckpgq.org/) — embedded graph database
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) — WASM parsing
- [Framer Motion](https://www.framer.com/motion/) — animation
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP
