<!-- markdownlint-disable MD033 MD040 -->

<h1 align="center">Dextree</h1>

<p align="center">
  <strong>See what your code actually does — and what your next commit could break.</strong>
</p>

<p align="center">
  <em>An interactive semantic graph of your codebase. Live in VS Code. Powered by Tree-sitter + DuckDB.</em>
</p>

<!--
  HERO IMAGE — when docs/hero.gif (or docs/hero.png) lands, uncomment the
  block below. A static screenshot of the graph view beats no image; aim for
  720p, ~3-8 seconds if animated.

  <p align="center">
    <img src="docs/hero.gif" alt="Dextree graph view inside VS Code" width="720"/>
  </p>
-->

<p align="center">
  <a href="https://github.com/dgtalbug/dextree/actions/workflows/ci.yml"><img src="https://github.com/dgtalbug/dextree/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://github.com/dgtalbug/dextree/actions/workflows/codeql.yml"><img src="https://github.com/dgtalbug/dextree/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"/></a>
  <a href="https://github.com/dgtalbug/dextree/actions/workflows/osv-scanner.yml"><img src="https://github.com/dgtalbug/dextree/actions/workflows/osv-scanner.yml/badge.svg" alt="OSV-Scanner"/></a>
  <a href="https://codecov.io/gh/dgtalbug/dextree"><img src="https://codecov.io/gh/dgtalbug/dextree/branch/main/graph/badge.svg" alt="Coverage"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange.svg" alt="Status: Pre-alpha"/>
  <a href="https://scorecard.dev/viewer/?uri=github.com/dgtalbug/dextree"><img src="https://api.securityscorecards.dev/projects/github.com/dgtalbug/dextree/badge" alt="OpenSSF Scorecard"/></a>
</p>

---

## What it does

> Three things every codebase tool _should_ do — but doesn't.

<table>
<tr>
<td width="33%" valign="top">

### Blast radius

Point at any branch, commit, or PR. Get a live visualization of _exactly_ what the change could break — with a risk score and the core files in the impact zone.

</td>
<td width="33%" valign="top">

### VS Code fusion

The graph is enriched with **live diagnostics**, **git blame**, and **test discovery** — signals headless competitors literally can't access. Ask "most-edited unused public function with type errors and no tests" as one query.

</td>
<td width="33%" valign="top">

### Goes where you work

Mermaid · Obsidian Canvas · PNG · PDF · SVG · SCIP · MCP server for Claude / Cursor / Copilot · Vite component for your docs site.

</td>
</tr>
</table>

---

## Status — pre-alpha

Dextree isn't on the Marketplace yet. **v0.1 is in active development.** [Watch this repo](https://github.com/dgtalbug/dextree/subscription) to get the release notification.

| Version | Status         | Ships                                                 |
| ------- | -------------- | ----------------------------------------------------- |
| v0.1    | 🔨 in progress | Graph view, Tree-sitter indexing, Mermaid export      |
| v0.2    | next           | LSP enrichment, diagnostics overlay, **blast radius** |
| v0.3    | planned        | Canvas / PNG / PDF / SVG export, MCP server           |
| v0.4    | planned        | Alfred — opt-in LLM narrative reports                 |

Active slices are tagged [`status:in-progress`](https://github.com/dgtalbug/dextree/issues?q=is%3Aissue+label%3Astatus%3Ain-progress). Open issues ready for pickup are tagged [`status:specced`](https://github.com/dgtalbug/dextree/issues?q=is%3Aissue+label%3Astatus%3Aspecced).

---

## Why a code graph at all?

Most code intelligence tools answer "what does this symbol do?" Dextree answers a different question: **"what depends on it, and what would break if I change it?"**

That sounds obvious. It isn't — because the answer requires:

1. A **structural graph** of every file in the repo (Tree-sitter pass)
2. A **semantic graph** with type-accurate edges (LSP pass)
3. **Live context** from your editor: diagnostics, blame, test discovery
4. A **query engine** fast enough to answer in milliseconds

Everyone has one or two. Dextree has all four, fused into one DuckDB file. No server, no daemon, no `tsserver` of doom — just an embedded graph that knows your code the way you do.

The full architectural pitch is in [.dextree/design.md](.dextree/design.md).

---

## Quickstart — when v0.1 ships

```bash
# In VS Code
Cmd+P → ext install dextree

# In your project
Cmd+Shift+P → Dextree: Index Workspace
```

That's it. Open the graph view, click any node, follow the call edges.

> Want it sooner? See [Development](#development) — clone, build, and you have it locally today.

---

## Commands

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `Dextree: Index Workspace`    | Index the current workspace into the embedded graph       |
| `Dextree: Open Graph View`    | Open the interactive WebGL graph webview                  |
| `Dextree: Export as Mermaid`  | Export the current view as a `.mmd` file                  |
| `Dextree: Show Blast Radius`  | Analyze impact of current branch vs `main` _(v0.2)_       |
| `Dextree: Run Alfred Prompt…` | Run a markdown prompt template against the graph _(v0.4)_ |

---

## Configuration

<details>
<summary>Settings reference</summary>

```jsonc
{
  "dextree.indexing.languages": ["typescript", "javascript", "python"],
  "dextree.indexing.autoIndex": true,

  "dextree.blastRadius.coreFanInThreshold": 10,
  "dextree.blastRadius.coreFilePatterns": ["**/auth/**", "**/core/index.*"],
  "dextree.blastRadius.maxHops": 5,

  "dextree.alfred.enabled": false, // opt-in LLM, off by default
  "dextree.alfred.provider": "anthropic", // anthropic | openai | ollama
  "dextree.alfred.model": "claude-sonnet-4-6",
  // API key stored in VS Code SecretStorage — never in settings
}
```

Full settings reference: [.dextree/design.md §9.2](.dextree/design.md)

</details>

---

## Development

Dextree is built **spec-first**. Every change starts as a spec in `specs/NNN-<slice>/`, gets a plan + task breakdown, and only then turns into code. Any agent — Claude, Copilot, or a human — can pick up a spec and implement it. The spec is the contract; the agent is interchangeable. See [.dextree/build.md](.dextree/build.md) for the operations manual.

```bash
git clone https://github.com/dgtalbug/dextree
cd dextree
pnpm install
pnpm build
```

| Script           | What it does              |
| ---------------- | ------------------------- |
| `pnpm dev`       | watch mode (all packages) |
| `pnpm build`     | build all packages        |
| `pnpm test`      | vitest, all packages      |
| `pnpm typecheck` | tsc, all packages         |
| `pnpm lint`      | ESLint, all packages      |

<details>
<summary>Project structure</summary>

```
packages/
  core/        — graph engine (parser, storage, query) — no VS Code deps
  extension/   — VS Code extension (webview, tree view, commands)
  alfred/      — LLM provider abstraction + prompt runner
  exporters/   — Mermaid, Canvas, PNG, PDF, SVG adapters
  mcp/         — MCP server
  cli/         — dextree CLI
  web/         — Vite-embeddable component
specs/         — slice specs (one folder per slice: spec.md, plan.md, tasks.md)
.dextree/      — design doc, rules, build playbook, alfred prompts
.specify/      — spec toolchain internals
.claude/       — repo-local Claude sub-agent definitions
.github/copilot-instructions.md  — Copilot agent guidance
```

</details>

### Contributing a slice

1. Read [.dextree/build.md](.dextree/build.md)
2. Find an open issue tagged [`type:slice`](https://github.com/dgtalbug/dextree/issues?q=label%3Atype%3Aslice) and [`status:specced`](https://github.com/dgtalbug/dextree/issues?q=label%3Astatus%3Aspecced) — each links to a spec under [`specs/`](specs/)
3. Pick it up locally (fork → branch → PR), or comment `@claude implement this` / `@copilot implement this` to dispatch an agent

---

## Architecture

Two-pass indexing over one DuckDB graph:

- **Pass 1** — Tree-sitter WASM parses every file structurally. Graph is usable in under a second.
- **Pass 2** — LSP semantic enrichment runs lazily in the background. Type-accurate call edges, resolved references, framework annotations upgrade the pass-1 graph in place.

Storage: **DuckDB + DuckPGQ** (ISO SQL:2023 graph queries) + **`vss`** (HNSW vector index, opt-in) + **`fts`** (symbol search). One embedded file. No server. No daemon.

The moat is editor fusion — live diagnostics, blame, test discovery — that headless tools simply can't see. Full pitch in [.dextree/design.md §6](.dextree/design.md).

---

## License

MIT © 2026 [@dgtalbug](https://github.com/dgtalbug)

## Built on

[Sigma.js](https://www.sigmajs.org/) · [graphology](https://graphology.github.io/) · [DuckDB](https://duckdb.org/) · [DuckPGQ](https://duckpgq.org/) · [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) · [Framer Motion](https://www.framer.com/motion/) · [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
