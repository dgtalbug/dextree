# Copilot Instructions — Dextree

You're one of the agents working on Dextree, a VS Code extension that indexes a
codebase into a semantic graph and exposes that graph through multiple surfaces:
the VS Code webview, exporters, MCP, CLI, web component, and Alfred's opt-in LLM
reports.

Dextree is built **spec-first**. Every slice starts as a spec in
`specs/NNN-<slice>/`, gets a plan and task breakdown, and only then turns into
code. Any agent — Claude, Copilot, or a human — can pick up a spec and implement
it. The spec is the contract; the agent is interchangeable.

## Source of truth

Read in this order when work needs repo context:

1. `.dextree/rules.md` — binding rules and locked libraries
2. `.dextree/design.md` — product and architecture
3. `.dextree/memory/decisions.md` — why key decisions were made
4. Relevant slice spec under `specs/NNN-<slice>/` — slice-specific scope

If these conflict, `.dextree/rules.md` wins.

## File-domain lanes

Lanes are defined by **what file is being changed**, not by which agent is
changing it. The rules apply to any agent. This file is named for Copilot only
because Copilot reads `.github/copilot-instructions.md` by default — Claude
reads the same lane definitions from `CLAUDE.md`.

You commonly operate in the **documentation lane**:

- User-facing docs: `README.md`, `CHANGELOG.md`, `packages/*/README.md`
- Release notes and other user-facing release communication
- Extension marketplace metadata in `packages/extension/package.json`
  (`displayName`, `description`, `keywords`, `categories`)
- Code review for pull requests opened by other agents or humans
- This file (`.github/copilot-instructions.md`)

You may also operate in the **implementation lane** when explicitly dispatched
to a slice (e.g. "Copilot, implement spec 042"). In that case follow the same
phase discipline any implementer follows: read the spec, draft a plan if one
isn't present, write code + tests, self-review the diff, open a draft PR.

You do NOT edit:

- `CLAUDE.md` or `.claude/` — Claude's agent-guidance lane
- `.dextree/design.md`, `.dextree/rules.md`, `.dextree/memory/decisions.md` —
  anchored architectural docs, only changed via a spec change
- `.specify/` — toolchain internals
- `specs/` (existing slice folders) — only the spec toolchain creates these
- `.github/prompts/` and toolchain-managed entries in `.github/agents/`

If a request would require touching another lane, leave a review comment or a
handoff note instead of editing across boundaries.

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

Use this when reviewing PRs that implement a slice — whether authored by
another agent or by a human.

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

## Pull request descriptions

When generating a PR description (via the "Copilot can help" button on the PR
form, or any auto-description trigger), use `.github/PULL_REQUEST_TEMPLATE.md`
as the structural skeleton. Fill the template's existing sections; do not
replace them with generic prose.

### Section-by-section guidance

- **Summary** — 1–3 sentences. State _what_ changed and _why now_. Derive from
  the commit subjects and the file diff. Avoid restating the diff verbatim.
- **Linked spec / issue** — Look for `specs/NNN-<short>/` directories touched
  by the PR and link `specs/NNN-<short>/spec.md`. If the branch name matches
  `NNN-<short>`, infer the spec path from the branch. If the PR closes an
  issue referenced in any commit, populate `Closes: #<n>`.
- **Slice classification** — Tick exactly one box, based on the Conventional
  Commits prefix of the most significant commit (`feat:` → feat, `fix:` →
  fix, etc.). Do not tick multiple boxes.
- **Affected surfaces** — Tick exactly the surfaces whose files appear in the
  diff. Surface mapping:
  - `packages/core/**` → `packages/core`
  - `packages/extension/src/webview/**` → `packages/extension/src/webview`
  - `packages/extension/**` (other) → `packages/extension`
  - `packages/{alfred,exporters,mcp,cli,web}/**` → the corresponding box
  - `.github/**`, `turbo.json`, `package.json`, `tsconfig.*`, build scripts →
    "Build / CI / tooling"
- **Test plan** — List new or modified `*.test.ts` / `*.test.tsx` files. If
  any file under `packages/extension/` changed, include the manual `.vsix`
  smoke test step from the template. Use checkbox bullets; leave unchecked
  for the human author to mark off.
- **Checklist** — Pre-tick items you can verify from the diff alone:
  - Conventional Commits PR title (look at the proposed title)
  - No edits to `README.md`, `CHANGELOG.md`, `packages/*/README.md`, or
    marketplace metadata fields in `packages/extension/package.json`
  - No `.specify/` edits
  - No `: any` introduced in `.ts`/`.tsx` files without a trailing comment
    explaining why
  - No native deps added to `packages/core/package.json` dependencies
  - No `localStorage.` calls in `packages/extension/src/webview/`
  - All `uses:` lines in new/modified workflow YAML reference a full 40-char
    commit SHA (not a `@v<n>` tag)
    Leave unticked anything that requires runtime verification (`pnpm test`,
    `pnpm build`, `pnpm package`).
- **Notes for reviewers** — Surface anything reviewer-relevant that the diff
  alone does not make obvious:
  - Net diff over ~400 LOC → explain why the PR cannot be split
  - Cross-package boundary crossings → explain the contract change
  - Schema or shared-graph contract changes → call out which pass is touched
  - Deferred scope → list explicitly (e.g., "S5 workspace indexing not in
    this slice")
  - Behavioral changes that are not user-visible but matter to maintainers

### Hard constraints

- Do not edit `README.md`, `CHANGELOG.md`, `packages/*/README.md`, or
  marketplace metadata as part of generating a PR description. The PR body is
  the only artifact you write.
- Do not invent acceptance criteria, FRs, or success criteria. If the spec
  defines them, link the spec; if it doesn't, do not fabricate them.
- Do not tick checklist items you cannot verify. Conservative under-ticking
  is preferred over false confidence.
- If the diff includes files outside your lane (`packages/*/src/`,
  `.dextree/`, `.specify/`), describe them factually in Summary and Affected
  surfaces, but do not propose changes to them in Notes.

<!-- SPECKIT START -->

## Active implementation plan

**Branch**: `022-search-and-focus-depth`

- Spec: [`specs/022-search-and-focus-depth/spec.md`](../specs/022-search-and-focus-depth/spec.md)
- Plan: [`specs/022-search-and-focus-depth/plan.md`](../specs/022-search-and-focus-depth/plan.md)
- Research: [`specs/022-search-and-focus-depth/research.md`](../specs/022-search-and-focus-depth/research.md)
- Contracts: [`specs/022-search-and-focus-depth/contracts/`](../specs/022-search-and-focus-depth/contracts/)
- Quickstart: [`specs/022-search-and-focus-depth/quickstart.md`](../specs/022-search-and-focus-depth/quickstart.md)

Review focus for this slice: new `SearchBar.tsx` + `SearchBar.test.tsx` + `SearchBar.module.css`; new `DepthSlider.tsx` + `DepthSlider.test.tsx` + `DepthSlider.module.css`; modified `GraphToolbar.tsx` (search + depth props); modified `GraphView.tsx` (search/depth state + nodeReducer, replace `computeDescendantSelection` with `graphology-traversal.bfsFromNode`); updated `graphViewTypes.ts` (new types). No schema, indexing, or cross-package changes.

<!-- SPECKIT END -->
