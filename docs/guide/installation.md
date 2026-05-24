# Installation

::: warning Not yet on the Marketplace
Dextree is pre-alpha. v0.1 has not shipped to the VS Code Marketplace yet. The instructions below describe the **planned** installation flow. Until v0.1 ships, see [Building from source](#building-from-source) to run it locally.
:::

## When v0.1 ships

```bash
# Inside VS Code
Cmd+P → ext install dextree
```

Then open any project and:

```bash
Cmd+Shift+P → Dextree: Index Workspace
```

The graph view opens automatically. Click any node to follow its calls.

## Building from source

If you want Dextree before v0.1 ships, clone and build the extension locally.

### Prerequisites

- **Node.js** ≥ 22.0.0
- **pnpm** exactly `11.1.2` (enforced by the `packageManager` field in `package.json`)
- **VS Code** ≥ 1.85

```bash :group=clone
# pnpm
git clone https://github.com/dgtalbug/dextree
cd dextree
pnpm install --frozen-lockfile
pnpm build
```

### Run the extension in a development host

From the repo root:

```bash
pnpm --filter dextree run dev
```

This opens a new VS Code window with Dextree loaded. Open any folder in that window and run `Dextree: Index Workspace`.

### Package a `.vsix` for manual install

```bash
pnpm package
```

The `.vsix` ends up in `packages/extension/`. Install it via `code --install-extension packages/extension/dextree-*.vsix`.

## Verifying the install

After installing, run `Dextree: Index Workspace` against any TypeScript / JavaScript project. The graph view should open within ~1 second of the command finishing.

If the command isn't visible, ensure VS Code is on **1.85 or later** — older versions don't expose the APIs Dextree needs.
