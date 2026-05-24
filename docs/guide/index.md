# What is Dextree

Dextree turns your repository into an interactive knowledge graph. Every symbol, call, import, and dependency is indexed into an embedded graph database (DuckDB + DuckPGQ) and made explorable through a WebGL-rendered visualization directly inside VS Code.

Unlike competitors that live outside the editor, Dextree fuses the graph with everything VS Code already knows — LSP type information, live diagnostics, git history, and test linkage — to give you signals no headless tool can produce.

## Why a code graph at all?

Most code intelligence tools answer "what does this symbol do?" Dextree answers a different question: **what depends on it, and what would break if I change it?**

That sounds obvious. It isn't — because the answer requires:

1. A **structural graph** of every file in the repo (Tree-sitter pass)
2. A **semantic graph** with type-accurate edges (LSP pass)
3. **Live context** from your editor: diagnostics, blame, test discovery
4. A **query engine** fast enough to answer in milliseconds

Everyone has one or two. Dextree has all four, fused into one DuckDB file. No server, no daemon, no `tsserver` of doom — just an embedded graph that knows your code the way you do.

## What you'll find in this guide

- **[Installation](./installation)** — set up the extension and run your first index.
- **[Two-pass indexing](./concepts/two-pass-indexing)** — how Tree-sitter and LSP cooperate to keep the graph both fast and accurate.
- **[Shared graph](./concepts/shared-graph)** — why every surface (webview, exporters, MCP, CLI, Alfred) reads the same DuckDB substrate.
- **[VS Code data fusion](./concepts/vs-code-fusion)** — the architectural moat that lets us answer questions headless competitors can't.

## Status

Dextree is **pre-alpha**. v0.1 is in active development and not yet on the VS Code Marketplace. Follow [the roadmap](https://github.com/dgtalbug/dextree/blob/main/ROADMAP.md) for the slice-by-slice plan, or [watch the repo](https://github.com/dgtalbug/dextree/subscription) for the release notification.

::: tip
The graph is the product. Visualizations, exports, MCP, and Alfred are surfaces over the same indexed substrate — change the schema once, every surface benefits.
:::
