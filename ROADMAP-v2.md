# Dextree Roadmap v2

This is the **merged roadmap draft** that combines:

- the **live slice/status tracking** from `ROADMAP.md`
- the **sequencing corrections** from `RESEARCH-SCRATCH.md`

It does **not** replace or modify `ROADMAP.md`. Use this file as the cleaner
planning view while the original remains the historical working ledger.

## 1. Planning Standard

### Product rule

Ship **truth before breadth**:

1. the graph contract must be honest
2. the local VS Code loop must be fast and reliable
3. only then should Dextree expand into moat overlays, exports, MCP, and Alfred

### Execution rule

- max **one active implementation slice**
- max **one active spec / clarification slice**
- branch-local code does **not** automatically change roadmap priority
- pass 1 must stay useful before pass 2 arrives
- public docs and metadata must not advertise non-shipped behavior

### State vocabulary

| State            | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| `done`           | merged and validated                                        |
| `ready-to-merge` | implementation exists; final review or merge remains        |
| `blocker`        | must be resolved before roadmap promotion can continue      |
| `blocked`        | valid slice, waiting on an earlier blocker                  |
| `active`         | current implementation focus                                |
| `next-up`        | next slice to spec or promote after the active focus clears |
| `later`          | intentional future work, not near-term                      |

## 2. Current Reality

Actual repo reality this roadmap must respect:

| Area                      | Reality                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| Packages                  | Only `packages/core` and `packages/extension` exist today             |
| Validation                | `pnpm lint` and `pnpm test` are green; `pnpm typecheck` is red        |
| Schema                    | missing `Annotation`, `Module`, `Test`, migrations, schema registry   |
| Graph truth               | UI/query path already references `CALLS`; runtime does not write them |
| Incremental loop          | workspace indexing still clears and rewrites everything               |
| Native runtime resilience | no proper DuckDB / tree-sitter doctor or fallback flow                |

## 3. Normalized Slice Board

This keeps the useful status visibility from `ROADMAP.md`, but normalizes it so
the order matches actual blockers.

| Spec dir                         | Design slice | Normalized state | Why                                                                                               |
| -------------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------- |
| `001-hello-symbol`               | S1           | `done`           | baseline proof already landed                                                                     |
| `002-hello-tree-view`            | S2           | `done`           | baseline tree surface already landed                                                              |
| `003-hello-webview`              | S3           | `ready-to-merge` | useful baseline UI exists; should be closed out first                                             |
| `004-cicd-foundation-fixes`      | —            | `blocker`        | red typecheck makes the validation baseline dishonest                                             |
| `005-cicd-github-actions`        | —            | `blocked`        | CI should follow honest local validation, not precede it                                          |
| `006-hello-graph`                | S4           | `blocked`        | must follow schema/truth fixes, not freeze the wrong graph contract                               |
| `007-persistent-workspace-cache` | S5           | `blocked`        | useful work, but should be reconciled against the corrected graph contract                        |
| `008-hello-workspace`            | S6           | `active`         | current SpecKit implementation slice; keep active, but do not let it define all of v0.1 by itself |

## 4. Active SpecKit Focus

### Active implementation slice

| Field            | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Spec dir         | `008-hello-workspace`                                                                             |
| Design slice     | `S6 — Hello Workspace`                                                                            |
| Branch           | `feature/slice-8-hello-workspace`                                                                 |
| Primary proof    | full-workspace indexing with progress + cancellation, plus hover neighborhood and PageRank sizing |
| Primary surfaces | VS Code tree view + graph webview                                                                 |

### Active slice summary

`008` remains the **active SpecKit slice**. That part should stay explicit.

The current `specs/008-hello-workspace/tasks.md` already marks the slice task
list as complete, including:

- workspace indexing with progress and cancellation
- hover-neighborhood graph interaction
- PageRank-driven node sizing
- validation / packaging / PR-prep tasks

### Active slice promotion rule

Keep `008` active, but apply this constraint:

> `008` can remain the active implementation slice, but it must **not** define
> the whole v0.1 release bar until the graph/schema truth blockers are resolved.

In practice, that means `008` is a **real implementation track**, but roadmap
promotion still depends on:

1. fixing the validation baseline (`004`)
2. resolving the schema/truth contract (`S3.5`)
3. ensuring `S4` visualizes the graph Dextree actually writes

## 5. Strategic Corrections

These are the parts where v2 intentionally tightens the original roadmap.

### 5.1 Treat S3.5 as a real blocker

`S3.5` is not cleanup. It is the point where the roadmap reconnects to reality.

Must include:

- `Annotation`, `Module`, and `Test` entities
- migration runner + baseline migration files
- schema registry table
- explicit edge-storage decision
- `fan_in` recomputation instead of hardcoded zeros

### 5.2 Make S4 truthful

The first graph slice must not pretend.

It should:

- introduce `Extractor` + `ExtractorRegistry`
- make the graph legend match emitted data
- add naive `CALLS` only if they are actually written and queryable

### 5.3 Raise the bar for S6 / S6.5

“Workspace indexing works” is not the same as “full clear and reparse works.”

For v0.1:

- hash-skip is required
- watcher-driven refresh is required
- unchanged file save should be a no-op for parse + DB write
- named progress phases are recommended, not mandatory

### 5.4 Pull RepoMap value forward

Keep PageRank/RepoMap work in v0.2, but make it user-visible **before Alfred**
through a repo-map text snapshot slice.

### 5.5 Keep full federation late, but add a lighter earlier story

Full merged multi-repo graphing still belongs late. Add an earlier read-only
repo-group view before attempting globally-addressable symbol IDs.

## 6. Recommended Working Order

This is the merged execution order that best fits both the live repo state and
the corrected roadmap logic.

| Priority | Workstream                           | Target state     | Why now                                                           |
| -------- | ------------------------------------ | ---------------- | ----------------------------------------------------------------- |
| 1        | `003-hello-webview`                  | `done`           | close the oldest surface baseline first                           |
| 2        | `004-cicd-foundation-fixes`          | `done`           | restore trust in `typecheck` and validation                       |
| 3        | `005-cicd-github-actions`            | `done`           | enforce the now-honest validation baseline                        |
| 4        | `008-hello-workspace`                | `ready-to-merge` | keep the active SpecKit slice moving; do not abandon current work |
| 5        | `S3.5` schema alignment + migrations | `next-up`        | true blocker before graph contract hardens further                |
| 6        | `006-hello-graph`                    | `next-up`        | first graph must reflect the corrected contract                   |
| 7        | `007-persistent-workspace-cache`     | `next-up`        | reconcile cache behavior against the corrected graph model        |

## 7. Release Roadmap

## Phase 0 — Baseline integrity

**Goal:** make the repo trustworthy enough that later slice validation means
something.

### Included work

- `003` — Hello Webview
- `004` — CI/CD foundation fixes
- `005` — GitHub Actions CI

### Exit gate

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and packaging are green

## Phase 1 — v0.1 truthful local graph loop

**Definition:** a developer can index a real local workspace in VS Code, reopen
it from cache, edit files, and see the graph remain truthful and responsive.

### Required slices

- `S3.5` — Schema alignment + migration scaffolding
- `S4` — Hello Graph
- `S5` — Persistent Workspace Cache
- `S6` — Hello Workspace
- `S6.5` — Auto-sync watcher
- `S6.8` — Session summary export (user-pull)
- `S6.9` — Release-truth gate
- `S7` — Hello Mermaid

### Exit gate

- pass 1 writes the graph the UI actually visualizes
- `CALLS` is either real naive pass-1 data or absent from UI claims
- unchanged file save does not trigger unnecessary parse/write work
- workspace reopen from cache is safe and obvious
- runtime doctor flow exists for DuckDB / WASM failures
- README and extension metadata match shipped commands and packages exactly

## Phase 2 — v0.2 first real moat

**Definition:** Dextree stops being only “graph in VS Code” and starts shipping
signals headless/browser competitors do not naturally own.

### Required slices

- `S8` — Hello LSP
- `S8.5` — Multi-language pass-1
- `S9` — Hello Diagnostics
- `S10` — Hello Git
- `S10.5` — Hello Tests
- `S10.7` — MCP server (read-only)
- `S11` — Hello Blast Radius
- `S11.5` — Framework route map
- `S11.7` — PageRank symbol ranking + community overlay
- `S11.8` — Repo-map text snapshot

### Exit gate

- pass 1 stays useful before pass 2 resolves
- MCP answers match the same graph/query model the UI uses
- at least one moat overlay is visibly compelling in-product

## Phase 3 — v0.3 surface expansion

**Definition:** add outward-facing surfaces only after the shared graph contract
and moat query model are dependable.

### Required slices

- `E1a` — SCIP exporter
- `E1b` — Canvas exporter
- `E1c` — PNG / PDF / SVG
- `E2` — MCP write tools + auto-config installer
- `E3` — Settings UI webview
- `S7.5` — PGQ / SQL query console, only if DuckPGQ feasibility is proven on target platforms

### Exit gate

- SCIP ships before prettier export work dominates attention
- export theming uses one semantic token system
- settings UI exists because there are enough real settings to justify it

## Phase 4 — v0.4 Alfred and lightweight federation

**Definition:** Alfred arrives only after the graph is already useful on its
own, and multi-repo value appears in a lighter form before full federation.

### Required slices

- `S12` — Hello Alfred
- `S13` — Built-in prompt library
- `S13.5` — Repo groups (read-only federation)

### Exit gate

- Alfred consumes repo-map and graph primitives that already exist
- prompt execution stays opt-in, BYOK, and preview-first
- repo-group mode proves whether users need more than scoped read-only federation

## Phase 5 — Later expansion

### v0.5

- `V1` — Vector search / local embeddings
- `V2` — Vite embeddable component

### v0.6

- `S14` — Workspace federation (merged multi-repo graph, globally addressable IDs)

## 8. What This v2 Preserves

These calls from the original roadmap were already right and remain right:

- MCP moved up to v0.2
- RepoMap/PageRank moved up to v0.2
- SCIP ships before Canvas/PDF/SVG
- full merged federation stays late

## 9. What This v2 Changes

- keeps the original’s useful live slice tracking, but normalizes it into one coherent queue
- keeps `008-hello-workspace` explicit as the active SpecKit slice
- treats `S3.5` as a real blocker instead of a side note
- defines v0.1 around **truth + speed**, not just first-graph existence
- adds `S6.8` session summary export
- adds `S6.9` release-truth gate
- adds `S11.8` repo-map text snapshot before Alfred
- adds `S13.5` repo groups before full federation

## 10. Near-Term Plan

If this merged roadmap is the planning source, the next actions should be:

1. close `003-hello-webview`
2. fix `004-cicd-foundation-fixes` until the validation baseline is honest
3. land `005-cicd-github-actions`
4. bring `008-hello-workspace` to a clean `ready-to-merge` state
5. spec `S3.5` in full as the next roadmap promotion gate
6. move `006-hello-graph` only after `S3.5` is approved
7. reconcile `007` and `008` against the corrected graph/schema contract

## 11. Summary

This merged roadmap keeps the **best part of the original**—live slice and
SpecKit awareness—and the **best part of v2**—a stricter, more honest release
sequence.

The key planning decision is:

> **Keep `008` active, but do not let it mask the fact that `S3.5` and graph
> truth still define whether v0.1 is real.**
