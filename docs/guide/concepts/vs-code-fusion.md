# VS Code data fusion

This is the architectural moat. Dextree lives inside VS Code on purpose — it can see things a headless tool cannot, no matter how clever its parser is.

## What VS Code knows that headless tools don't

When you open a project in VS Code, the editor has already done a substantial amount of work that's invisible to a CLI tool running in a separate process:

| VS Code knows…                    | Because it has…                                            |
| --------------------------------- | ---------------------------------------------------------- |
| Type information for every symbol | An LSP client per-language, with project context loaded    |
| Live diagnostics                  | `vscode.languages.getDiagnostics()` for the open workspace |
| Git blame & file recency          | `vscode.git` extension API, refreshed on every save        |
| Test discovery + last results     | `vscode.tests` provider state from running test runners    |
| Workspace folders                 | `vscode.workspace.workspaceFolders` (handles multi-root)   |
| Active extensions                 | `vscode.extensions.all` (what tooling is actually loaded)  |
| User selection                    | `window.activeTextEditor.selection`                        |
| Open documents                    | `workspace.textDocuments` (with unsaved-buffer content)    |

Dextree taps these as **graph enrichments**. The DuckDB graph gets a column per dimension. Queries that combine them become trivial:

```sql
-- "Most-edited public function with type errors and no tests"
SELECT s.name, s.file, s.git_recency, s.diagnostic_count, s.test_coverage
FROM symbol s
WHERE s.visibility = 'public'
  AND s.diagnostic_count > 0
  AND s.test_coverage = 0
ORDER BY s.git_recency DESC
LIMIT 20;
```

Try doing that with a static analyzer running from your CI.

## How it actually flows

<ArchDiagram
  id="vs-code-fusion"
  prev-id="shared-graph-fanout"
  :height="500"
  :nodes="[
    { id: 'editor', label: 'VS Code editor',    sub: 'host process',       tone: 'cyan',    col: 0, row: 1 },
    { id: 'lsp',    label: 'LSP',               sub: 'per-language',       tone: 'amber',   col: 1, row: 0 },
    { id: 'diag',   label: 'Diagnostics',       sub: 'vscode.languages',   tone: 'rose',    col: 1, row: 1 },
    { id: 'git',    label: 'Git',               sub: 'vscode.git API',     tone: 'warn',    col: 1, row: 2 },
    { id: 'tests',  label: 'Tests',             sub: 'vscode.tests',       tone: 'ok',      col: 1, row: 3 },
    { id: 'p2',     label: 'Pass 2 enrichment', sub: 'reads + writes',     tone: 'amber',   col: 2, row: 1 },
    { id: 'graph',  label: 'DuckDB graph',      sub: 'enriched columns',   tone: 'neutral', col: 3, row: 1 },
  ]"
  :edges="[
    { source: 'editor', target: 'lsp',   step: 1, animated: true, fromSide: 'right', toSide: 'left' },
    { source: 'editor', target: 'diag',  step: 1, animated: true, fromSide: 'right', toSide: 'left' },
    { source: 'editor', target: 'git',   step: 1, animated: true, fromSide: 'right', toSide: 'left' },
    { source: 'editor', target: 'tests', step: 1, animated: true, fromSide: 'right', toSide: 'left' },
    { source: 'lsp',    target: 'p2',    step: 2, dashed: true, animated: true },
    { source: 'diag',   target: 'p2',    step: 2, dashed: true, animated: true },
    { source: 'git',    target: 'p2',    step: 2, dashed: true, animated: true },
    { source: 'tests',  target: 'p2',    step: 2, dashed: true, animated: true },
    { source: 'p2',     target: 'graph', step: 3, animated: true },
  ]"
/>

## Degradation rules

Each editor signal is **optional**. If LSP isn't ready, the column stays NULL until Pass 2 runs. If git isn't available (rare), git columns stay NULL. If no tests are configured, test columns stay NULL.

This matters because:

- **Most users have at least 2-3 signals available**, even on a fresh project
- **Queries that need every signal are rare**; queries that need any one signal are common
- **Pass 1's structural graph stays usable** even when every editor signal is missing

The graph never refuses to render because a signal is missing. It just renders less.

## Why competitors can't catch up easily

Headless code intelligence tools (Sourcegraph, Code Crawler, code-graph engines) have to:

1. Spin up their own LSP servers (cold-start latency, no project context)
2. Re-implement git enrichment from scratch (slower than `vscode.git`'s already-warm cache)
3. Lack test-runner state entirely (no `vscode.tests` equivalent)
4. Lack live diagnostics (they only see what their own analyzer reports)

By the time a headless tool catches up, it has reimplemented half of VS Code in its own process. Dextree starts from "VS Code has already done all of this" and gets to read the results for free.

## Further reading

- [Two-pass indexing](./two-pass-indexing) — when Pass 2 collects these signals
- [Shared graph](./shared-graph) — how every surface benefits from the enriched columns
