# Configuration

Dextree settings are namespaced under `dextree.*` in your VS Code settings. All settings have sensible defaults; override only what you need.

## Indexing

```jsonc
{
  // Languages to extract Pass 1 symbols from. Set to [] to disable indexing
  // for languages you don't care about (faster cold index).
  "dextree.indexing.languages": ["typescript", "javascript", "python", "markdown"],

  // Re-index automatically on file save. When false you must run
  // `Dextree: Index Workspace` manually.
  "dextree.indexing.autoIndex": true,

  // Maximum files to index in a single batch. Lower this on machines with
  // limited RAM; higher = faster cold index but more peak memory.
  "dextree.indexing.batchSize": 200,
}
```

## Blast radius

```jsonc
{
  // Fan-in threshold above which a file is considered "core" — touching it
  // triggers the elevated risk warning in blast-radius reports.
  "dextree.blastRadius.coreFanInThreshold": 10,

  // Explicit glob patterns marking files as core regardless of fan-in.
  // Useful for auth modules, shared types, etc.
  "dextree.blastRadius.coreFilePatterns": ["**/auth/**", "**/core/index.*", "**/shared/types.*"],

  // How many hops the impact analysis follows before stopping. Higher
  // catches more transitive impacts; lower runs faster.
  "dextree.blastRadius.maxHops": 5,
}
```

## Alfred (opt-in LLM layer)

::: warning Off by default
Alfred is **disabled** unless you opt in. No request is made to any LLM provider without `dextree.alfred.enabled: true`. API keys live in [VS Code SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never in `settings.json`.
:::

```jsonc
{
  // Master switch.
  "dextree.alfred.enabled": false,

  // Provider: "anthropic" | "openai" | "ollama" (local).
  "dextree.alfred.provider": "ollama",

  // Model identifier passed to the provider. See provider docs for valid values.
  "dextree.alfred.model": "claude-sonnet-4-6",

  // Maximum tokens per response. Increase for long architecture reports.
  "dextree.alfred.maxTokens": 4096,
}
```

API keys are set via the command palette:

```text
Cmd+Shift+P  →  Dextree: Set Alfred API Key
```

The key is stored in SecretStorage and never written to disk in plaintext.

## Webview

```jsonc
{
  // Initial graph layout algorithm. "forceAtlas2" is best for medium repos;
  // "circular" is fastest for small repos.
  "dextree.webview.defaultLayout": "forceAtlas2",

  // Maximum nodes to render at once. Beyond this Dextree shows a "filter
  // first" screen instead of trying to draw 50,000+ nodes.
  "dextree.webview.maxNodes": 5000,

  // Show diagnostics overlay (LSP errors / warnings) on graph nodes.
  "dextree.webview.showDiagnostics": true,
}
```

## Watcher

```jsonc
{
  // Re-index on file system changes (creates / deletes / renames).
  "dextree.watcher.enabled": true,

  // Verbose logging — only useful for debugging the watcher itself.
  "dextree.watcher.verbose": false,
}
```

## Full settings reference

The complete settings catalogue (types, ranges, defaults, slice provenance) is generated from `packages/extension/package.json` `contributes.configuration`. Open VS Code's settings UI (`Cmd+,` / `Ctrl+,`) and filter by `dextree.` to browse every setting alongside its description and current value.
