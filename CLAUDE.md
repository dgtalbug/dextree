# CLAUDE.md — Dextree

> **Priority order for conflict resolution:**
> `.dextree/rules.md` → `CLAUDE.md` → `.dextree/design.md`
> If any conflict is found, stop and flag it in the PR.

---

## What is Dextree

A VS Code extension that indexes codebases into a semantic graph (DuckDB + DuckPGQ), with multiple output surfaces: in-IDE webview, Mermaid/Canvas/PNG/PDF/SVG exports, MCP server, Vite component, and opt-in LLM reports via Alfred.

---

## How Dextree is built

Dextree is built **spec-first**. Every change starts as a spec in `specs/NNN-<slice>/`, gets a plan and task breakdown, and only then turns into code. Any agent (Claude, Copilot, or a human) can pick up a spec and implement it. The spec is the contract; the agent is interchangeable.

**The spec → plan → tasks → implementation flow:**

1. A slice spec is authored under `specs/NNN-<slice>/spec.md` (managed via the SpecKit toolchain in `.specify/`)
2. A plan is generated next to it (`plan.md`) — design, contracts, data model
3. A tasks file (`tasks.md`) breaks the plan into ordered, dependency-aware work items
4. An implementation PR delivers the slice, links back to the spec, and follows the file-domain lanes below

You are reading `CLAUDE.md` because you're an agent operating in this repo. The rules apply to any agent — the file is named for Claude only because Claude Code reads this filename by default. Copilot reads the same rules from `.github/copilot-instructions.md`.

---

## Where everything lives

```
specs/                 ← spec-driven slice definitions (one folder per slice)
  NNN-<short>/
    spec.md            ← what + why for this slice
    plan.md            ← how (design, contracts, data model)
    tasks.md           ← ordered work items
    contracts/         ← type or interface contracts pinned by the spec
    research.md        ← prior-art or decision rationale (optional)
    quickstart.md      ← how to validate the slice (optional)

.specify/              ← SpecKit toolchain — DO NOT MODIFY by hand
  templates/           ← spec/plan/tasks templates the toolchain renders
  scripts/             ← spec-flow helpers

.dextree/              ← project documentation (read before coding)
  design.md            ← architecture, schema, VS Code data sources, slice plan
  rules.md             ← binding rules — highest priority constraint document
  build.md             ← build operations manual
  kickstart.md         ← setup guide and onboarding
  memory/
    decisions.md       ← decision log — read before making architectural choices
  alfred/
    _README.md         ← Alfred prompt template format spec
    *.md               ← built-in Alfred prompt templates

.github/
  agents/              ← agent role definitions (toolchain-managed)
  prompts/             ← toolchain prompts (SpecKit-managed)
  copilot-instructions.md  ← agent guidance for Copilot
  workflows/           ← CI, release, security, lifecycle workflows

.claude/
  settings.json        ← Claude Code project config
  agents/              ← repo-local Claude sub-agents (planner, implementer, etc.)

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
4. The slice spec under `specs/NNN-<slice>/` — what this slice does

---

## File-domain lanes

Lanes are defined by **what file is being changed**, not by which agent is changing it. Any agent (Claude, Copilot, human) follows the same lane boundaries.

**Implementation lane** — Claude commonly operates here, Copilot may also.

- `packages/*/src/` — implementation code
- `packages/*/test/` — tests
- Inline JSDoc comments

**Documentation lane** — Copilot commonly operates here, Claude may also when asked.

- `README.md`
- `CHANGELOG.md`
- `packages/*/README.md`
- Release notes
- Extension marketplace metadata (`displayName`, `description`, `keywords`, `categories` in `packages/extension/package.json`)

**Agent-guidance lane** — each agent owns its own instructions file.

- `CLAUDE.md` (this file) — read by Claude
- `.github/copilot-instructions.md` — read by Copilot
- Do not edit the other agent's instructions file unless explicitly asked

**Spec lane** — never edit by hand, always via the spec toolchain.

- `specs/` — slice specs live here
- `.specify/` — toolchain internals
- `.github/prompts/` — toolchain prompts
- Existing entries in `.github/agents/` that the toolchain manages

**Anchored documents** — never modify without a spec change first.

- `.dextree/design.md`
- `.dextree/rules.md`
- `.dextree/memory/decisions.md`
- Anything in `.dextree/alfred/` unless the slice spec explicitly says to touch a prompt

If you think one of these needs updating, flag it in the PR description and open a follow-up spec instead.

---

## Standards

- **Language:** TypeScript. Strict mode. No `any` without a justifying comment.
- **Runtime:** Node ≥ 22.0.0
- **Package manager:** pnpm 11.1.2 exact. Never npm, yarn, or bun.
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

| Concern                      | Approved                                  | Banned                              |
| ---------------------------- | ----------------------------------------- | ----------------------------------- |
| UI framework                 | React                                     | Vue, Svelte, Solid, Preact          |
| Graph (main view)            | Sigma.js + graphology                     | D3 (direct), cytoscape, vis-network |
| Graph (focused/blast radius) | `@xyflow/react` v12+                      | `reactflow` (legacy), `vue-flow`    |
| Animation                    | framer-motion                             | react-spring, gsap, animejs         |
| State management             | zustand                                   | redux, mobx, jotai, recoil          |
| Template engine              | handlebars                                | mustache, nunjucks, ejs, pug        |
| Test runner                  | vitest                                    | jest, mocha, ava                    |
| PDF                          | pdf-lib                                   | puppeteer, playwright, jspdf        |
| LLM clients                  | @anthropic-ai/sdk, openai, fetch (Ollama) | langchain, @vercel/ai, @ai-sdk/\*   |
| Utilities                    | native ES2022+                            | lodash, underscore, ramda           |

---

## Implementing a slice (Claude Code, local)

When running in Claude Code with the repo-local sub-agents available, use them in this order to keep slice implementation predictable:

```
dextree-planner       → produce implementation plan from the spec, wait for approval
dextree-implementer   → write code from approved plan
dextree-tester        → add tests (cannot touch implementation files)
dextree-self-reviewer → review own diff, block push if FAIL
dextree-pusher        → branch, commit, gh pr create --draft
```

Never skip self-review before pushing.

If you're not Claude Code, follow the same shape conceptually: plan first, implement against the plan, write tests, self-review the diff, then open a draft PR. The point isn't the named sub-agents — it's the phase discipline.

---

## Branch, commit, PR conventions

- **Branch:** `feature/slice-<N>-<short>`, `fix/<issue>-<short>`, `refactor/<scope>-<short>`
- **Commits:** Conventional Commits — `feat(core):`, `fix(extension):`, `test(core):`, etc.
- **No co-author trailers:** Never add `Co-authored-by:` lines to commit messages. This applies to all agents (Claude, Copilot, any automation).
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

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dextree** (2298 symbols, 3970 relationships, 142 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource                                 | Use for                                  |
| ---------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/dextree/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/dextree/clusters`       | All functional areas                     |
| `gitnexus://repo/dextree/processes`      | All execution flows                      |
| `gitnexus://repo/dextree/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
