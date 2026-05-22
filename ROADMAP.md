# Dextree Roadmap

This is the draft working roadmap for building Dextree through small SpecKit-driven
vertical slices.

The goal is to avoid writing every spec up front. Keep the long-range roadmap at a
coarse level, but fully specify only the next slice you are ready to build.

## How To Use This Roadmap

Use three planning levels:

1. **Roadmap level**: keep the whole product sequence visible from S0 to later
   surfaces.
2. **Active spec level**: write a full SpecKit spec only for the next slice, or at
   most the next one or two slices.
3. **Implementation level**: generate plan and tasks only after the active spec is
   approved.

That keeps the repo adaptive while still preserving direction.

## Working Rules

- One slice should prove one clear product step.
- One slice should stay independently demoable.
- Prefer one primary surface per slice plus only the minimum shared core change.
- Preserve pass 1 usefulness before taking on pass 2 accuracy work.
- Keep package ownership explicit: shared graph work in `packages/core`, VS Code UI
  in `packages/extension`, other surfaces in their owning packages.
- Ship each slice through a draft PR with validation before moving on.

## Operating Limits

To keep the roadmap useful for agentic execution instead of turning into a wish list,
apply these limits:

- Max **one slice in implementation** at a time.
- Max **one slice in spec/clarification** at a time.
- Keep only the **next one or two slices** fully thought through; everything after
  that stays coarse.
- Do not start a new slice because a later one looks more exciting. Finish the
  current proof point first.

## Slice States

Use these states consistently when updating this roadmap, issues, and PRs:

| State               | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `roadmap`           | Mentioned here only. No detailed spec work yet.                     |
| `next-up`           | Candidate for the next spec. Still not detailed.                    |
| `in-spec`           | Being written or clarified in SpecKit. No implementation yet.       |
| `ready-for-plan`    | Spec is approved and can move to `speckit.plan`.                    |
| `in-implementation` | Code and tests are being written.                                   |
| `in-review`         | Draft PR is open and validation is running or Copilot is reviewing. |
| `done`              | Merged, validated, and reflected back into the roadmap.             |

## Promotion Gates

### Definition of Ready

A slice is ready to leave roadmap-level planning only when all of the following are
true:

- The slice has one primary proof point.
- The owning package or packages are explicit.
- The primary surface is explicit.
- The independent validation is known.
- The slice does not mix multiple new surfaces or multiple major architecture
  decisions.
- Pass 1 vs pass 2 expectations are explicit if indexing is involved.
- Privacy and opt-in boundaries are explicit if Alfred or remote calls are involved.

### Definition of Done

A slice is done only when all of the following are true:

- Spec, plan, and tasks are committed or otherwise captured in the repo.
- Code, tests, and validation are complete.
- The slice's independent proof has been demonstrated.
- The draft PR has passed review and merged.
- README, changelog, or marketplace docs are updated if the change is user-facing.
- This roadmap is updated with any scope, ordering, or dependency changes learned
  from the slice.

## Spec-To-Code Loop

### 1. Pick the next slice

Choose the smallest remaining step that unlocks a visible proof point.

For each candidate, answer:

- What user-visible proof does this slice deliver?
- Which package owns the behavior?
- Does it depend on pass 1 only, or on pass 2 / VS Code data sources?
- What is explicitly out of scope?

### 2. Write the slice spec

Use `speckit.specify` to create one feature spec for that slice.

A good Dextree slice spec should name:

- Primary surface: webview, tree view, exporter, MCP, CLI, web component, or Alfred
- Impacted packages
- Shared graph impact: schema, indexing, query layer, or none
- Independent test for the slice
- Edge cases when enrichment, diagnostics, git, or tests are unavailable
- Measurable success criteria

Do not spec a large phase as one feature. Spec the smallest valuable proof point.

### 3. Clarify before design

Use `speckit.clarify` when any of these are still fuzzy:

- package ownership
- pass 1 vs pass 2 behavior
- user-visible acceptance criteria
- quality gates or privacy boundaries

If the slice still has unresolved ambiguity after clarification, do not code it yet.

### 4. Generate the implementation plan

Use `speckit.plan` once the spec is stable.

The plan should confirm:

- the shared graph contract remains intact
- package boundaries stay clean
- the approved stack is sufficient
- validation is clear: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and slice-specific proof

### 5. Generate executable tasks

Use `speckit.tasks` to break the slice into independent story-scoped tasks.

Task quality bar:

- tasks grouped by user story
- package-local file paths
- tests before implementation where applicable
- no vague "wire everything" tasks

### 6. Implement through the agent workflow

Recommended flow:

1. Claude implements the approved plan.
2. Claude adds tests and runs local validation.
3. Claude opens a draft PR.
4. Copilot reviews correctness, risks, docs, and release-note impact.
5. Only then move to the next slice.

### 7. Re-plan after each slice

At the end of every slice:

- update this roadmap if scope shifted
- tighten the next slice based on what was learned
- keep later slices coarse until they are near-term work

## Current Slice State

Actual state as of 2026-05-22.

| Spec dir                         | Design slice | State               | Notes                                                                                                  |
| -------------------------------- | ------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `001-hello-symbol`               | S1           | `done`              | Parser → DuckDB → extension command end-to-end                                                         |
| `002-hello-tree-view`            | S2           | `done`              | Sidebar TreeView with file → symbol hierarchy                                                          |
| `003-hello-webview`              | S3           | `in-review`         | React webview, message protocol, symbol list, directory tree, nav; on branch 003                       |
| `004-cicd-foundation-fixes`      | —            | `in-spec`           | Fix lint/typecheck/coverage scripts before CI is wired; intermediate slice                             |
| `005-cicd-github-actions`        | —            | `in-spec`           | GitHub Actions CI/CD workflow; depends on 004                                                          |
| `006-hello-graph`                | S4           | `in-spec`           | Sigma + graphology graph render; **active spec** — depends on pre-S4 schema-alignment slice (see S3.5) |
| `007-persistent-workspace-cache` | S5           | `in-implementation` | Workspace cache + identity resolution; code lives on `feature/slice-8-hello-workspace`                 |
| `008-hello-workspace`            | S6           | `in-implementation` | Full-workspace indexing with progress + cancellation; same branch                                      |

> Intermediate slices 004 and 005 are CI/CD prerequisites inserted before S4.
> S5 and S6 are listed as `in-implementation` because their code already lives on the active branch
> ahead of formal ROADMAP promotion — see RESEARCH-SCRATCH.md §2.
> The design slice numbering (S0–S13) and spec directory numbering are independent.

## Recommended Execution Queue

This is the practical queue, not just the long-range sequence.

| Priority | Spec dir                    | State       | Why now                                                                    |
| -------- | --------------------------- | ----------- | -------------------------------------------------------------------------- |
| 1        | `003-hello-webview`         | `in-review` | Merge 003 branch; validates S3 before CI exists.                           |
| 2        | `004-cicd-foundation-fixes` | `in-spec`   | Fix scripts so CI can trust them; prerequisite for 005.                    |
| 3        | `005-cicd-github-actions`   | `in-spec`   | Wire CI once scripts are honest.                                           |
| 4        | `006-hello-graph`           | `in-spec`   | First real graph render — the "wow" moment; ready to move to plan + tasks. |

Anything after `006` should stay at roadmap level until 006 is merged or nearly merged.

The next roadmap-level candidate after `006` is a persistence slice: settle
workspace or checkout cache identity and persisted DB reuse before taking on full
workspace indexing and reindex behavior.

## Recommended Incremental Slice Sequence

### Phase 0: Foundation

**Dependency rule**: do not treat later slices as real until the repo can install,
lint, typecheck, test, and track its agent/spec metadata correctly.

#### S0 — Repo and SpecKit foundation

**Spec focus**: monorepo scaffold, agent instructions, SpecKit setup, tracked repo
metadata, baseline tooling, and draft CI path.

**Code focus**: workspace/package scaffolding, pnpm/turbo wiring, empty packages,
base scripts, repo governance.

**Done when**: the repo can install, lint, typecheck, and hold specs and agent
metadata in git.

### Phase 1: v0.1 core loop

**Dependency rule**: this phase should prove the full pass 1 loop before any moat or
multi-surface work becomes active.

#### S1 — Hello Symbol

**Spec focus**: prove one-file parsing to one stored symbol with a minimal extension
command or message.

**Code focus**: pass 1 parser path, DuckDB write/read, minimal extension command.

**Independent proof**: parse one TypeScript file and show one discovered symbol end
to end.

#### S2 — Hello Tree View

**Spec focus**: turn indexed symbols into a first VS Code UI surface.

**Code focus**: tree data provider in `packages/extension`, symbol lookup from core.

**Independent proof**: one file's symbols render in a VS Code Tree View and can
navigate to source.

#### S3 — Hello Webview

**Spec focus**: establish extension-to-webview messaging with a minimal React UI.

**Code focus**: webview bootstrapping, message bridge, React render shell.

**Independent proof**: the webview opens and shows indexed symbol data from the
extension host.

#### S3.5 — Schema alignment + migration scaffolding (pre-S4 hard prerequisite)

**Spec focus**: converge `packages/core/src/storage/schema.ts` with design §8 entity
model before the S4 graph render locks the wire format. See RESEARCH-SCRATCH.md §3 (Ranked Findings).

**Code focus**:

- Add `Annotation`, `Module`, `Test` tables (currently missing per design §8.2).
- Parameterize `_schema_version` writes (currently hardcoded literal `1` in
  `packages/core/src/storage/repository.ts:88,119,182`).
- Pick: per-edge-kind tables (§8.4) OR unified `edge` table (§8.5). Document choice
  in `.dextree/memory/decisions.md`.
- Wire `fan_in` recomputation as the last step of `replaceFileGraph` (currently
  hardcoded `0`).
- Add `packages/core/src/storage/migrations/` with `001-initial.sql` baseline and an
  `applyMigrations()` runner.
- Add a `_schema_version` registry table populated at `initializeSchema` time.

**Independent proof**: existing tests still green; a single seeded annotation +
module + test row reads back round-trip; `fan_in` for a known symbol is non-zero
after indexing.

#### S4 — Hello Graph

**Spec focus**: render a real graph for a small workspace sample using pass 1 edges.

**Code focus**: graph query path, Sigma integration, subgraph extraction, graph node
selection.

- **Required**: introduce `Extractor` interface + `ExtractorRegistry` (design §8.6).
  Refactor existing `extractTypeScriptFile`/`extractPlainFile` as registrants.
- **Required**: pass-1 emits naive `CALLS` edges from `call_expression` tree-sitter
  nodes. `metadata.kind = "naive"` for later S8 upgrade-in-place.
- **Required**: implement the chosen edge-storage variant from S3.5; query layer
  reads it.

**UI/UX (per RESEARCH-SCRATCH.md §10.2)**: ship minimap viewport rectangle (G1), LOD
label policy (G7), hover-card mini-LSP basic shell (G6), keyboard cheatsheet `?` +
`j/k/f/o` bindings (G3). Optional enhancements deferred.

**Independent proof**: a 10-file graph renders, and clicking a node navigates to its
definition. **At least one `CALLS` edge is visible.**

#### S5 — Persistent Workspace Cache

**Spec focus**: define how Dextree identifies a persisted local graph for one
workspace or repo checkout and safely reuses it across VS Code restarts and repo
reopens.

**Code focus**: cache identity, DB location policy, persisted cache metadata,
startup validation, and load-from-cache behavior before reindex.

**Independent proof**: index a small repo, close and reopen VS Code on the same
checkout, and show the tree and graph from the persisted DB without re-running a
full index first.

#### S6 — Hello Workspace

**Spec focus**: move from toy inputs to full-workspace indexing with progress and
manual reindex.

**Code focus**: workspace file discovery, incremental indexing loop, progress UI,
reindex command.

- **Required**: per-file content-hash (SHA-256) staleness check before reparse.
- **Required**: persisted `file.hash` already exists in schema; wire
  `if hash unchanged: skip`.
- **Required**: named pipeline-phase progress — replace generic
  "Discovering / Parsing / Writing" with `scan → parse → persist → resolve → index`
  as a horizontal stepper inside `withProgress`; each phase has its own elapsed
  timer. See RESEARCH-SCRATCH.md §10.2.b G20 + §13.2 (prior art: GitNexus
  `AnalyzeProgress.tsx`).
- **Inspirational**: CodeIndexer `sync/merkle.ts` (~200 LOC Merkle tree persisted to
  disk) — optional acceleration if hash-only proves too slow on 10K+ file repos.
  See RESEARCH-SCRATCH.md §13.4.

**UI/UX (per RESEARCH-SCRATCH.md §10.2)**: 3-step VS Code walkthrough on first
activation; spotlight onboarding (G16); status-bar live counter
`$(database) <n> syms`; empty-state surfaces for 0/1/10 nodes; named pipeline-phase
stepper (G20).

**Independent proof**: index a representative workspace with visible progress and a
usable graph at the end. **Saving an unchanged file is a no-op (no DB writes).**

#### S6.5 — Auto-sync watcher

**Spec focus**: debounced FS watcher (FSEvents/inotify/RDCW via VS Code's
`FileSystemWatcher`) with selective reparse. Closes the codegraph file-watcher gap.

**Code focus**: workspace `FileSystemWatcher` registration, debounce policy,
per-file dirty marker integration with S6's hash-based skip path.

**Independent proof**: editing a file outside VS Code (or inside, via save) triggers
a debounced reparse that updates only the affected symbols. Editing rapidly does not
queue redundant reparses.

#### S7 — Hello Mermaid

**Spec focus**: prove the first "render everywhere" export surface.

**Code focus**: subgraph serialization, Mermaid export command, output path handling.

- **Required**: native VS Code settings `dextree.exporters.theme` (Light/Dark/Print)
  as a 3-radio picker. Defer WYSIWYG token editor to E3.
  See RESEARCH-SCRATCH.md §11.

**Independent proof**: export the current graph view as a valid Mermaid file.
Theme applied at export time matches the chosen radio.

#### S7.5 — PGQ / SQL query console (FAB)

**Spec focus**: make the §4.8 PGQ / SQL moat **visible** to users. The strategic
differentiator is invisible without a UI surface that lets power users write
queries. Falls back to plain SQL if the H5 PGQ feasibility smoke test fails on a
target platform. See RESEARCH-SCRATCH.md §10.2.b G19 + §13.2 (prior art: GitNexus
`QueryFAB.tsx`).

**Code focus**: Codicon `terminal` FAB bottom-right of graph; slide-up panel with
Monaco editor (free — already in VS Code) using a custom `dextree.pgq` language
config; prefab dropdown of canned queries (`MATCH (n:Function) ...`); results in
plain HTML `<table>` with CSS Modules (no `@tanstack/react-table` without rules
amendment); matched nodes highlight in graph.

**Hard prerequisite**: H5 PGQ feasibility smoke test — confirm
`INSTALL duckpgq; LOAD duckpgq; FROM GRAPH_TABLE (...);` works on Mac + Linux +
Windows against `@duckdb/node-api@1.5.2-r.1` before scoping this slice. If PGQ
fails on a target, the console ships in SQL-only mode.

**Independent proof**: opening the FAB and running the default prefab "All
Functions" query returns rows and highlights the matched nodes in the graph.

### Phase 2: v0.2 moat features

**Dependency rule**: do not start these until the pass 1 graph loop and first export
surface are stable enough that enrichment and data fusion are improving a working
product, not compensating for an unfinished base.

#### S8 — Hello LSP

**Spec focus**: introduce pass 2 semantic enrichment without breaking pass 1
usefulness.

**Code focus**: LSP adapter, upgrade-in-place logic for resolved edges, UI refresh for
enriched nodes.

**Independent proof**: pass 1 graph appears immediately, then resolved semantic edges
upgrade live.

#### S8.5 — Multi-language pass-1

**Spec focus**: extend pass-1 beyond TypeScript to TS/JS/Python/Go/Rust via the
`ExtractorRegistry` introduced in S4. Closes the 1-vs-19-langs competitive gap.
See RESEARCH-SCRATCH.md §6.1 (gap analysis).

**Code focus**: per-language `Extractor` registrants; bundle tree-sitter WASM
grammars under `packages/extension/resources/`; per-language `call_expression`
heuristics for naive `CALLS`.

**Independent proof**: indexing a mixed-language repo (Python + Go + TS) produces
symbols and naive `CALLS` edges in all three languages.

#### S9 — Hello Diagnostics

**Spec focus**: fuse VS Code diagnostics into the graph.

**Code focus**: diagnostics ingestion, graph annotations, diagnostic overlays or
filters.

**Independent proof**: symbols with VS Code errors or warnings are visible and
queryable in the graph.

#### S10 — Hello Git

**Spec focus**: introduce git-derived recency and authorship signals.

**Code focus**: Git API integration, file metadata updates, recency visualization.

**Independent proof**: graph nodes can be colored or filtered by git recency.

#### S10.5 — Hello Tests

**Spec focus**: link tests to symbols-under-test via framework heuristics
(jest/vitest/pytest); populate `TESTED_BY` edges (design §8.4) at index time.
Closes the test-linkage moat gap (no competitor has this).
See RESEARCH-SCRATCH.md §6.3 (potential edges not yet delivered).

**Code focus**: test-file detection, framework-specific heuristics, `Test` entity
table writes (relies on S3.5 schema alignment), `TESTED_BY` edge emission.

**Independent proof**: a function with a colocated `*.test.ts` shows the test as a
linked node in the graph; coverage overlay (#11) lights it up.

#### S10.7 — MCP server (read-only)

**Spec focus**: expose the v0.2 graph to external agents over MCP, read-only, using
the same SQL/PGQ query layer the webview consumes. Promoted from E2 (v0.3) because
every traction-y competitor leads with MCP. See RESEARCH-SCRATCH.md §7.4 (MCP sequencing decision).

**Code focus**: `packages/mcp/` (new); `@modelcontextprotocol/sdk`; MCP tools
wrapping existing `query/*` exports. No write surface, no agent-mutation tools.

**Independent proof**: a Claude Code or Cursor MCP-aware session can call
`dextree.find_callers(symbol)` and get the same answer the webview hover card shows.

#### S11 — Hello Blast Radius

**Spec focus**: combine git diff plus reverse graph traversal into Dextree's first
killer feature.

**Code focus**: changed-line-to-symbol mapping, reverse traversal, scoring,
core-file warnings, blast-radius panel.

**Independent proof**: compare against `main`, show changed symbols, affected
neighbors, score, and core-file hits.

#### S11.5 — Framework route map

**Spec focus**: detect framework-driven HTTP routes (Express, NestJS, FastAPI, Flask,
Spring — five to start); materialize `ApiEndpoint` extension nodes (design §8.3).
Closes the codegraph 14-framework gap.
See RESEARCH-SCRATCH.md §6 (Gap Analysis) + §13.1 (codegraph framework folders).

**Code focus**: per-framework extractors registered against the §8.6 plugin contract;
`ApiEndpoint` writes; `ROUTES_TO` edges.

**UI/UX**: process / execution-flow panel — left-side panel grouping detected routes
by cross-community vs intra-community; clicking a route opens a side-panel detail
with step list + "Focus in graph" action. **NOT** rendered as Mermaid in the webview
(locked-rule violation); Mermaid is the export-only path. See RESEARCH-SCRATCH.md
§10.2.b G18 + §13.2 (prior art: GitNexus `ProcessesPanel.tsx`).

**Independent proof**: indexing an Express app surfaces every route as a queryable
`ApiEndpoint` with HTTP method + path + handler symbol; the process panel lists them
grouped by community.

#### S11.7 — PageRank symbol ranking + community overlay

**Spec focus**: port Aider's RepoMap PageRank algorithm
(`aider/repomap.py:368-540`, ~170 LOC) to graphology; write back to
`symbols.pagerank` column. Used by S11 blast-radius scoring and every Alfred prompt's
top-K selection. See RESEARCH-SCRATCH.md §13.3 (Aider PageRank) + §10.2.b G17
(community overlay) + §13.2 (GitNexus community visualization).

**Code focus**: graphology PageRank traversal; personalization vector built from
"mentioned identifiers" per Aider; persistence; recompute hook on incremental
reindex. **Same recompute pass also computes Louvain communities** via
`graphology-communities-louvain` (allowed under RULE-LIB-002) and writes a
`community_id` column on `symbol` — communities and PageRank share the graph
materialization cost.

**UI/UX**: community overlay — nodes colored by community index; soft convex hulls
behind clusters via Sigma reducers; `C` toggles hull visibility. PageRank exposed
via node size + tooltip ("imported by 12, central in cluster 3").

**Independent proof**: PageRank values for top-10 symbols on the dextree repo itself
match the expected centrality intuition (e.g., `initialize`, `replaceFileGraph`,
`openDatabase` in the top tier); the dextree repo decomposes into ≥3 visually
distinct communities (parser, storage, webview).

### Phase 3: v0.3 more surfaces

**Dependency rule**: only expand surfaces after the shared graph contract and the
extension-host flow are already dependable.

#### E1 — Export adapters

**Spec focus**: expand from Mermaid to durable export adapters. Ship in sub-slice
order to front-load the cheapest credibility win.
See RESEARCH-SCRATCH.md §7.3 (SCIP-before-Canvas decision).

- **E1a — SCIP exporter** (ship first). `sourcegraph/scip` is the de-facto interop
  format; zero competitors emit it. Cheap (`scip.proto` protobuf marshalling) once
  S8 resolves symbol IDs. Unlocks `src` CLI navigation and Sourcegraph Cloud
  integration as a distribution channel.
- **E1b — Canvas exporter**.
- **E1c — PNG / PDF / SVG via `pdf-lib`**.

**Code focus**: serializer adapters per sub-slice, artifact theming reused from S7
theme picker, export commands.

#### E2 — MCP write tools + auto-config installer

**Spec focus**: extend the v0.2 read-only MCP from S10.7 with write tools and an
auto-config installer (write MCP entries to Claude/Cursor/Codex config files; emit
`CLAUDE.md` skill hints). The read-only MCP itself ships earlier in S10.7.
See RESEARCH-SCRATCH.md §7.4 (MCP sequencing decision).

**Code focus**: MCP write tools (re-index, annotate, lens-save); installer command
`dextree mcp install --target=claude|cursor|codex` writing into each tool's MCP
config; idempotent re-install.

**Independent proof**: running `dextree mcp install --target=claude` writes a valid
entry to the user's Claude Code config and the next Claude session sees the Dextree
MCP server with all read+write tools.

#### E3 — Settings UI webview

**Spec focus**: move beyond raw VS Code settings for Alfred and export controls.

**Code focus**: settings webview, SecretStorage integration, config preview.

### Phase 4: v0.4 Alfred

**Dependency rule**: Alfred should come after the graph and query model are useful on
their own; otherwise the LLM layer will hide core product gaps.

#### S12 — Hello Alfred

**Spec focus**: run one prompt over graph data with explicit opt-in and preview.

**Code focus**: provider abstraction, prompt loading, query execution, preview/send
flow.

- **Required prerequisite**: repo-map text view (`Dextree: Show repo-map` command)
  built from PageRank top-K per file, token-budgeted (default 1024). This is the
  default system prompt every Alfred prompt consumes — Aider proved this is the
  only way LLM pair-programming scales to large repos. See RESEARCH-SCRATCH.md
  §10.2.b G21 + §13.3 (prior art: `aider/repomap.py:368-540`). Also serves users
  who want a non-LLM text snapshot for `Cmd-F` and copy/paste.

**Independent proof**: `architecture-overview` generates a markdown result from the
current graph; the repo-map command produces a token-budgeted text snapshot without
any network call.

#### S13 — Built-in prompt library

**Spec focus**: make Alfred useful through prompt coverage, not just plumbing.

**Code focus**: prompt packaging, validation, UX for prompt discovery and execution.

#### S14 — Workspace federation (multi-repo)

**Spec focus**: multi-folder VS Code workspace → one merged graph; cross-repo symbol
resolution via globally-addressable symbol IDs. Closes the multi-repo / microservice
mesh gap that GitNexus monetizes as paid enterprise.
See RESEARCH-SCRATCH.md §7.5 (multi-repo sequencing — note: audit recommends keeping it _late_, this slice represents a deliberate over-ride if we want the wedge).

**Code focus**: extend S5 cache identity to be globally addressable; merged-graph
query path; cross-repo edge resolution; UI for switching the active scope between
"all repos" and a single member.

**Independent proof**: open a multi-folder workspace containing 3 microservice repos;
the graph shows cross-repo `CALLS` edges where an HTTP route in repo A is consumed
by a client in repo B.

**Target version**: v0.6 (after v0.5 stabilization, before any further surface work).

### Phase 5: v0.5 extensions

**Dependency rule**: keep these explicitly deferred until there is real usage data
showing the core graph and export path are stable.

#### V1 — Vector search / local embeddings

Only spec this after graph traversal limits are clear from real use.

#### V2 — Vite embeddable component

Only spec this after the extension graph and export contract have stabilized.

## What To Spec Next

Recommended near-term order:

1. Finish or verify `S0` to green.
2. Write the full `S1` spec.
3. Clarify and plan `S1`, then implement it.
4. Move `S2` to full spec only after `S1` is validated.
5. Keep `S3+` at roadmap granularity until the current active slice is nearly done.

## A Good Slice Size For This Repo

A slice is probably the right size when:

- it has one primary proof point
- it touches one primary user surface
- it fits one draft PR
- it can be validated with one clear demo plus narrow automated checks
- it does not require speculative abstractions for later slices

A slice is too big when:

- it spans multiple new surfaces at once
- it mixes pass 1, pass 2, exporters, and Alfred in one spec
- it cannot be described with one independent test
- it needs more than one major architectural decision at the same time

## Immediate Next Move

If you want the fastest path to working software, the next document to write should
be the full S1 spec: one-file parse, one stored symbol, one visible proof in the
extension.

After that, the next best improvement is not another long-range roadmap rewrite; it
is keeping the roadmap updated with real slice state as work lands.
