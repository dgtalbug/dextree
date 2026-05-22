# Dextree

> Index your codebase into a navigable semantic graph — inside VS Code.

Dextree turns your repository into an interactive knowledge graph. Every symbol, call, import, and dependency is indexed into an embedded graph database (DuckDB + DuckPGQ) and made explorable through a WebGL-rendered visualization directly inside VS Code.

Click any symbol to explore its callers and dependents. Filter by type, language, or quality flag. Export to Mermaid, Canvas, PNG, PDF, or SVG. Ask Alfred — Dextree's opt-in LLM layer — to generate architecture overviews and PR risk reports from the graph.

> **Preview release.** Active development. APIs and commands may change between minor versions until v1.0.

---

## Features

- **Interactive graph view** — WebGL-rendered symbol graph (Sigma.js) inside VS Code. Click any node to jump to definition or expand its neighborhood.
- **Two-pass indexing** — Tree-sitter for instant structural extraction, LSP-driven semantic enrichment running lazily in the background. Graph is usable in under a second.
- **Blast radius analysis** — point at any branch, commit, or PR number and see what changed, how far the impact propagates, and which core files are in the blast radius _(v0.2)_.
- **Quality signals** — dead code, circular imports, complexity metrics, god classes, and security smell flags — all computed as graph properties.
- **VS Code data fusion** — the graph is enriched with diagnostics, git blame, and test linkage. Queries like "most-edited unused public function with type errors and no tests" are a single DuckPGQ statement.
- **Export everywhere** — Mermaid, Obsidian Canvas, PNG, PDF, SVG, SCIP _(v0.3)_.
- **Alfred (opt-in LLM)** — editable markdown prompt templates drive narrative reports. BYOK, local models supported. Nothing leaves your machine by default _(v0.4)_.
- **MCP server** — expose the indexed graph to Claude Code, Cursor, and other MCP-compatible agents _(v0.3)_.

---

## Getting started

1. Install the extension.
2. Open a workspace with TypeScript, JavaScript, Python, or Markdown sources.
3. Open the **Dextree** view in the Activity Bar.
4. Run **Dextree: Index Workspace** (or click the sync icon in the Symbols view).
5. Run **Dextree: Open Graph View** to explore the indexed graph.

---

## Commands

| Command                           | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `Dextree: Index Workspace`        | Index every supported file in the workspace |
| `Dextree: Index File`             | Index the currently open file               |
| `Dextree: Open Graph View`        | Open the interactive graph webview          |
| `Dextree: Clear Workspace Index`  | Clear the graph for the current workspace   |
| `Dextree: Clear All Indexed Data` | Clear the global Dextree index              |

---

## Supported languages

TypeScript, JavaScript, TSX, JSX, Python, and Markdown. Additional languages are tracked in the [roadmap](https://github.com/dgtalbug/dextree/blob/main/ROADMAP.md).

---

## Requirements

- VS Code 1.85 or newer.
- A workspace folder open in the editor (the extension indexes per workspace).

---

## Release notes

Release notes are published with each GitHub Release: <https://github.com/dgtalbug/dextree/releases>.

---

## Links

- **Source:** <https://github.com/dgtalbug/dextree>
- **Issues:** <https://github.com/dgtalbug/dextree/issues>
- **Roadmap:** <https://github.com/dgtalbug/dextree/blob/main/ROADMAP.md>

Licensed under [MIT](LICENSE).
