# Shared graph

Every Dextree surface — the webview, exporters, MCP server, CLI, web embed, and Alfred prompts — reads the **same DuckDB graph**. There is no per-surface state, no parallel index, no synced cache. One graph; many lenses.

## The architectural promise

<ArchDiagram
  id="shared-graph-fanout"
  prev-id="two-pass-flow"
  next-id="vs-code-fusion"
  :height="440"
  :nodes="[
    { id: 'graph',  label: 'DuckDB graph', sub: 'core/storage',              tone: 'neutral', col: 1, row: 1 },
    { id: 'web',    label: 'Webview',     sub: 'Sigma.js',                  tone: 'amber',   col: 0, row: 0 },
    { id: 'exp',    label: 'Exporters',   sub: 'Mermaid · PNG · PDF · SVG', tone: 'cyan',    col: 0, row: 1 },
    { id: 'mcp',    label: 'MCP server',  sub: 'Claude · Cursor · Copilot', tone: 'rose',    col: 0, row: 2 },
    { id: 'cli',    label: 'CLI',         sub: 'dextree analyze',           tone: 'ok',      col: 2, row: 0 },
    { id: 'embed',  label: 'Web embed',   sub: 'Vite component',            tone: 'amber',   col: 2, row: 1 },
    { id: 'alfred', label: 'Alfred',      sub: 'LLM reports',               tone: 'warn',    col: 2, row: 2 },
  ]"
  :edges="[
    { source: 'web',    target: 'graph', fromSide: 'right', toSide: 'left',  animated: true },
    { source: 'exp',    target: 'graph', fromSide: 'right', toSide: 'left',  animated: true },
    { source: 'mcp',    target: 'graph', fromSide: 'right', toSide: 'left',  animated: true },
    { source: 'cli',    target: 'graph', fromSide: 'left',  toSide: 'right', animated: true },
    { source: 'embed',  target: 'graph', fromSide: 'left',  toSide: 'right', animated: true },
    { source: 'alfred', target: 'graph', fromSide: 'left',  toSide: 'right', animated: true },
  ]"
/>

## Why this matters

The shared-graph rule means **schema changes ripple to every surface for free**. When we add a `complexity` column to the `symbol` table in Pass 2:

- The webview's filter UI can immediately group by complexity
- Mermaid exports can color-code high-complexity nodes
- The MCP server exposes a `find_complex_functions` query
- Alfred's "dead code report" template can include complexity as a flag

Zero coordination across surfaces. Zero risk of stale data per surface.

## What this rules out

The contract bans every per-surface workaround that would otherwise be tempting:

- **No** per-surface caches (e.g. "the webview keeps its own filtered subset")
- **No** per-surface transformation pipelines (e.g. "the MCP server normalizes paths differently")
- **No** parallel storage (e.g. "blog post export uses its own SQLite copy")

Every surface owns its **presentation logic** (how it renders a node, what fields it shows). The graph is the source of truth for **what exists**.

## Where it lives in the repo

```text
packages/
  core/                      ← owns the shared graph
    src/storage/             ← DuckDB schema + migrations
    src/query/               ← DuckPGQ query helpers
    src/extractors/          ← Pass 1 + Pass 2 logic that writes to the graph
  extension/                 ← webview surface
  exporters/                 ← Mermaid / Canvas / PNG / PDF / SVG adapters
  mcp/                       ← MCP server surface
  cli/                       ← dextree CLI surface
  web/                       ← Vite-embeddable component
  alfred/                    ← LLM prompt runner
```

`packages/core` exports a clean `Indexer` interface. Every other surface depends on it via `workspace:*`. If a surface needs new data, the change goes into `packages/core` first.

::: warning Don't fork the graph
If you ever feel pressure to "just keep a local cache for performance," fix the query instead. The shared-graph rule isn't a performance optimization — it's the reason Dextree's footprint stays small (one DB file, no daemon).
:::

## Further reading

- [Two-pass indexing](./two-pass-indexing) — how data gets into the shared graph
- [VS Code data fusion](./vs-code-fusion) — the editor signals layered onto it
