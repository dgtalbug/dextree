# Commands

Every command Dextree contributes to VS Code's command palette.

| Command                       | What it does                                        | Available  |
| ----------------------------- | --------------------------------------------------- | ---------- |
| `Dextree: Index Workspace`    | Index the current workspace into the embedded graph | v0.1       |
| `Dextree: Open Graph View`    | Open the interactive WebGL graph webview            | v0.1       |
| `Dextree: Export as Mermaid`  | Export the current view as a `.mmd` file            | v0.1       |
| `Dextree: Show Blast Radius`  | Analyze impact of current branch vs `main`          | v0.2       |
| `Dextree: Run Alfred Prompt…` | Run a markdown prompt template against the graph    | v0.4       |
| `Dextree: Export Summary`     | Export a session summary as Markdown                | v0.1 / S14 |

## Running a command

All Dextree commands appear under the **Dextree:** prefix in the command palette:

```text
Cmd+Shift+P  →  type "Dextree"
```

The first command you'll typically run is **`Dextree: Index Workspace`** — it parses every supported file in the current workspace and writes the result into the workspace's DuckDB graph file.

## Keyboard shortcuts

Dextree doesn't bind any keyboard shortcuts by default. You can bind any command via VS Code's standard `keybindings.json`:

```json
{
  "key": "cmd+shift+d",
  "command": "dextree.openGraphView"
}
```

Available command IDs follow the pattern `dextree.<camelCase>` — e.g. `dextree.indexWorkspace`, `dextree.openGraphView`, `dextree.exportMermaid`.

## Status bar

When indexing is active, Dextree shows a status-bar item with the current progress and an estimated time-to-completion. Click the item to cancel an in-flight index.
