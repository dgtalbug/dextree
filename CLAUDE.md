# CLAUDE.md — Dextree

> **Priority order for conflict resolution:**
> `.dextree/rules.md` → `CLAUDE.md` → `.dextree/design.md`
> If any conflict is found, stop and flag it in the PR.

---

## What is Dextree

A VS Code extension that indexes codebases into a semantic graph (DuckDB + DuckPGQ), with multiple output surfaces: in-IDE webview, Mermaid/Canvas/PNG/PDF/SVG exports, MCP server, Vite component, and opt-in LLM reports via Alfred.

---

## Where everything lives

```
.dextree/              ← ALL project documentation (read before coding)
  design.md            ← architecture, schema, VS Code data sources, slice plan
  rules.md             ← 37 binding rules — highest priority constraint document
  build.md             ← agentic build operations manual (Mode A/B, sub-agents)
  kickstart.md         ← setup guide and onboarding
  memory/
    decisions.md       ← decision log — read before making architectural choices
  alfred/
    _README.md         ← Alfred prompt template format spec
    *.md               ← built-in Alfred prompt templates

.specify/              ← SpecKit owns this — DO NOT MODIFY
  templates/           ← spec templates; use SpecKit workflow to create new specs

.github/
  agents/              ← agent definitions (SpecKit + Dextree agents coexist here)
  prompts/             ← prompts (SpecKit-managed)
  copilot-instructions.md  ← Copilot's lane definition
  workflows/           ← CI, Claude handoff, Copilot handoff, release

.claude/
  settings.json        ← Claude Code project config
  agents/              ← Dextree custom sub-agents (planner, implementer, etc.)

packages/              ← ALL CODE lives here
  core/                ← pure logic, no VS Code deps
    src/quality/       ← quality signals (subdirectory, NOT a top-level package)
  extension/           ← VS Code extension
  alfred/              ← LLM provider abstraction + prompt runner
  exporters/           ← output format adapters
  mcp/                 ← MCP server
  cli/                 ← dextree CLI
  web/                 ← Vite-embeddable component
```

**Read order for any task:**
1. `.dextree/rules.md` — what's binding
2. `.dextree/design.md` — what we're building
3. `.dextree/memory/decisions.md` — why key decisions were made
4. The spec in `.specify/` — what this slice does

---

## Your lane (Claude)

**You own:**
- `packages/*/src/` — implementation code
- `packages/*/test/` — tests
- Inline JSDoc comments

**You do NOT touch (Copilot's lane):**
- `README.md`
- `CHANGELOG.md`
- `packages/*/README.md`
- `.github/copilot-instructions.md`
- Extension marketplace metadata (`displayName`, `description`, `keywords`, `categories` in `packages/extension/package.json`)
- Anything in `.dextree/alfred/` unless the spec explicitly says to add a prompt

**You do NOT touch (SpecKit's lane):**
- `.specify/` — entirely SpecKit-managed
- `.github/prompts/` — SpecKit-managed
- Existing entries in `.github/agents/` that belong to SpecKit

**You do NOT modify architectural documents without a spec:**
- `.dextree/design.md`
- `.dextree/rules.md`
- `.dextree/memory/decisions.md`
If you think a document needs updating, flag it in the PR description.

---

## Standards

- **Language:** TypeScript. Strict mode. No `any` without a justifying comment.
- **Runtime:** Node ≥ 22.0.0
- **Package manager:** pnpm 11.3.0 exact. Never npm, yarn, or bun.
- **Monorepo:** pnpm workspaces + turborepo. Internal refs use `workspace:*`.
- **Build:** esbuild (extension host), Vite (webview + web), tsup (core/alfred/mcp/cli)
- **Tests:** vitest. Co-locate with code. Coverage ≥ 70% on touched files.
- **Linting:** eslint + prettier. Zero warnings before opening PR.
- **Imports:** `@/*` aliases. No deep relative paths (`../../../`).
- **No native deps in `core`** — must run via WASM in browser contexts.
- **No `localStorage` in webviews** — use `vscode.postMessage` for persistence.
- **VS Code CSS variables only** in webview styles — never hardcoded hex.
- **Codicons only** for icons in the extension webview.
- **CSS Modules** for component styles — no Tailwind, no CSS-in-JS.

## Approved libraries (binding — see `.dextree/rules.md` for full list)

| Concern | Approved | Banned |
|---|---|---|
| UI framework | React | Vue, Svelte, Solid, Preact |
| Graph (main view) | Sigma.js + graphology | D3 (direct), cytoscape, vis-network |
| Graph (focused/blast radius) | `@xyflow/react` v12+ | `reactflow` (legacy), `vue-flow` |
| Animation | framer-motion | react-spring, gsap, animejs |
| State management | zustand | redux, mobx, jotai, recoil |
| Template engine | handlebars | mustache, nunjucks, ejs, pug |
| Test runner | vitest | jest, mocha, ava |
| PDF | pdf-lib | puppeteer, playwright, jspdf |
| LLM clients | @anthropic-ai/sdk, openai, fetch (Ollama) | langchain, @vercel/ai, @ai-sdk/* |
| Utilities | native ES2022+ | lodash, underscore, ramda |

---

## Sub-agent usage (Mode A — local Claude Code)

Custom Dextree sub-agents are in `.claude/agents/`. Use them in this order:

```
dextree-planner       → produce implementation plan, wait for approval
dextree-implementer   → write code from approved plan
dextree-tester        → add tests (cannot touch implementation files)
dextree-self-reviewer → review own diff, block push if FAIL
dextree-pusher        → branch, commit, gh pr create --draft
```

Never skip self-review before pushing.

---

## Branch, commit, PR conventions

- **Branch:** `feature/slice-<N>-<short>`, `fix/<issue>-<short>`, `refactor/<scope>-<short>`
- **Commits:** Conventional Commits — `feat(core):`, `fix(extension):`, `test(core):`, etc.
- **PR title:** `[slice S<N>] <short description>`
- **PR:** open as draft. Fill every section of `.github/PULL_REQUEST_TEMPLATE.md`. Link spec and issue.
- **Mark ready:** only after CI green and self-review passes.
- **Never push to `main` directly.**

---

## When in doubt

- Ambiguous spec → comment on the issue, don't guess
- Out-of-scope change needed → note as `TODO(slice-N+M):` comment, flag in PR
- Task > ~400 LOC net → split into multiple PRs
- Architecture question → read `.dextree/memory/decisions.md` first
