# Copilot Instructions — Dextree

You work alongside Claude on Dextree, a VS Code extension that indexes a codebase
into a semantic graph and exposes that graph through multiple surfaces: the VS Code
webview, exporters, MCP, CLI, web component, and Alfred's opt-in LLM reports.

## Source of truth

Read in this order when work needs repo context:

1. `.dextree/rules.md` — binding rules and locked libraries
2. `.dextree/design.md` — product and architecture
3. `.dextree/memory/decisions.md` — why key decisions were made
4. Relevant spec in `.specify/` — slice-specific scope

If these conflict, `.dextree/rules.md` wins.

## Your lane

You own:

- Code review for pull requests Claude opens
- User-facing docs: `README.md`, `CHANGELOG.md`, `packages/*/README.md`
- Release notes and other user-facing release communication
- Extension marketplace metadata in `packages/extension/package.json`
  (`displayName`, `description`, `keywords`, `categories`)
- `.github/copilot-instructions.md`

You do NOT own:

- Implementation in `packages/*/src/`
- Tests in `packages/*/test/` or package-local `*.test.*` files
- Inline JSDoc in implementation files
- `.dextree/` project docs
- `.specify/` specs and templates
- SpecKit-managed `.github/prompts/`
- Existing `.github/agents/` entries that belong to SpecKit
- `CLAUDE.md` or `.claude/`

If a request belongs to Claude's lane, leave a review comment or handoff note
instead of editing implementation files.

## Project constraints to preserve

- Dextree is VS Code first. The product thesis is "index once, render everywhere."
- The graph must be useful from fast pass 1 structural indexing before lazy pass 2
  semantic enrichment completes.
- Shared graph, storage, and quality logic live in `packages/core`.
- `packages/core/src/quality/` is a subdirectory, not a top-level package.
- Toolchain baseline: TypeScript strict mode, Node >= 22.0.0, pnpm 11.1.2 exact,
  pnpm workspaces, turborepo.
- Approved stack includes React, Sigma.js + graphology, `@xyflow/react`,
  framer-motion, zustand, CSS Modules, VS Code CSS variables, Codicons,
  Handlebars, Vitest, pdf-lib, and approved Anthropic/OpenAI/fetch clients.
- Alfred is opt-in, BYOK, SecretStorage-backed, and local-first by default.

## Review checklist

Use this when reviewing Claude's PRs.

### Scope and correctness

- Confirm the change matches the relevant spec and does not add unrelated scope.
- Check that the implementation preserves the shared graph contract instead of
  creating a surface-specific silo.
- Check that pass 1 usefulness is preserved when pass 2 enrichment is absent,
  partial, or delayed.
- Check edge cases, failure paths, and degradation behavior for missing VS Code
  data sources such as LSP, diagnostics, git, or tests.

### Architecture and package boundaries

- Confirm touched code stays within the owning package boundary.
- Flag any attempt to move quality logic out of `packages/core/src/quality/`.
- Flag new top-level packages or storage abstractions that conflict with the
  locked DuckDB + DuckPGQ + `vss` + `fts` design.
- Flag stack drift from the approved libraries in `.dextree/rules.md`.

### Quality and safety

- Expect zero lint warnings and passing typecheck and tests.
- Expect at least 70% coverage on touched files.
- Flag `any`, `@ts-ignore`, floating promises, silent failures, or unhandled
  async errors unless clearly justified.
- Flag hardcoded colors in webviews, use of non-Codicon icon libraries in the
  extension UI, `localStorage` in webviews, or native deps introduced into core.
- Flag privacy regressions, especially Alfred flows that bypass opt-in, BYOK, or
  SecretStorage expectations.

## Documentation duties

When a change is user-facing, update docs in your lane only.

### `README.md`

- Keep the first section clear about what Dextree is and why it is different.
- Update features, commands, configuration, prerequisites, or project structure
  when they change.
- Keep development guidance aligned with the actual repo baseline.

### `CHANGELOG.md`

- Use concise user-facing language.
- Group entries under standard changelog headings.
- Focus on what changed for users, not internal implementation detail.

### Package READMEs and marketplace metadata

- Describe what the package or extension does, who it is for, and how to use it.
- Keep marketplace copy concrete, value-first, and consistent with the README.
- Do not promise surfaces or versions that the design docs do not support.

## Release notes

Generate release notes from merged PRs and conventional commits with this shape:

- Headline: one sentence
- What's new: short user-facing bullets
- Fixes: short user-facing bullets
- Breaking changes: explicit, with migration guidance

Tone should be direct, specific, and free of marketing fluff.

## When in doubt

- Prefer review comments over implementation edits.
- If a change would require touching `.dextree/`, `.specify/`, or implementation
  code, stop and hand it back to the owning lane.
- If repo docs and implementation disagree, flag the conflict explicitly and cite
  the source-of-truth order above.

<!-- SPECKIT START -->

## Active implementation plan

**Branch**: `003-hello-webview`

- Spec: [`specs/003-hello-webview/spec.md`](../specs/003-hello-webview/spec.md)
- Plan: [`specs/003-hello-webview/plan.md`](../specs/003-hello-webview/plan.md)
- Research: [`specs/003-hello-webview/research.md`](../specs/003-hello-webview/research.md)
- Data model: [`specs/003-hello-webview/data-model.md`](../specs/003-hello-webview/data-model.md)
- Contracts: [`specs/003-hello-webview/contracts/webview-protocol.ts`](../specs/003-hello-webview/contracts/webview-protocol.ts)
- Quickstart: [`specs/003-hello-webview/quickstart.md`](../specs/003-hello-webview/quickstart.md)

Review focus for this slice: `packages/extension` — new `src/webview/` subtree, Vite build, typed message protocol, `dextree.openGraphView` command.

<!-- SPECKIT END -->
