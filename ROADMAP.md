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

Actual state as of 2026-05-16.

| Spec dir                    | Design slice | State       | Notes                                                                            |
| --------------------------- | ------------ | ----------- | -------------------------------------------------------------------------------- |
| `001-hello-symbol`          | S1           | `done`      | Parser → DuckDB → extension command end-to-end                                   |
| `002-hello-tree-view`       | S2           | `done`      | Sidebar TreeView with file → symbol hierarchy                                    |
| `003-hello-webview`         | S3           | `in-review` | React webview, message protocol, symbol list, directory tree, nav; on branch 003 |
| `004-cicd-foundation-fixes` | —            | `in-spec`   | Fix lint/typecheck/coverage scripts before CI is wired; intermediate slice       |
| `005-cicd-github-actions`   | —            | `in-spec`   | GitHub Actions CI/CD workflow; depends on 004                                    |
| `006-hello-graph`           | S4           | `in-spec`   | Sigma + graphology graph render; **active spec**                                 |

> Intermediate slices 004 and 005 are CI/CD prerequisites inserted before S4.
> The design slice numbering (S0–S12) and spec directory numbering are independent.

## Recommended Execution Queue

This is the practical queue, not just the long-range sequence.

| Priority | Spec dir                    | State       | Why now                                                                    |
| -------- | --------------------------- | ----------- | -------------------------------------------------------------------------- |
| 1        | `003-hello-webview`         | `in-review` | Merge 003 branch; validates S3 before CI exists.                           |
| 2        | `004-cicd-foundation-fixes` | `in-spec`   | Fix scripts so CI can trust them; prerequisite for 005.                    |
| 3        | `005-cicd-github-actions`   | `in-spec`   | Wire CI once scripts are honest.                                           |
| 4        | `006-hello-graph`           | `in-spec`   | First real graph render — the "wow" moment; ready to move to plan + tasks. |

Anything after `006` should stay at roadmap level until 006 is merged or nearly merged.

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

#### S4 — Hello Graph

**Spec focus**: render a real graph for a small workspace sample using pass 1 edges.

**Code focus**: graph query path, Sigma integration, subgraph extraction, graph node
selection.

**Independent proof**: a 10-file graph renders, and clicking a node navigates to its
definition.

#### S5 — Hello Workspace

**Spec focus**: move from toy inputs to full-workspace indexing with progress and
manual reindex.

**Code focus**: workspace file discovery, incremental indexing loop, progress UI,
reindex command.

**Independent proof**: index a representative workspace with visible progress and a
usable graph at the end.

#### S6 — Hello Mermaid

**Spec focus**: prove the first "render everywhere" export surface.

**Code focus**: subgraph serialization, Mermaid export command, output path handling.

**Independent proof**: export the current graph view as a valid Mermaid file.

### Phase 2: v0.2 moat features

**Dependency rule**: do not start these until the pass 1 graph loop and first export
surface are stable enough that enrichment and data fusion are improving a working
product, not compensating for an unfinished base.

#### S7 — Hello LSP

**Spec focus**: introduce pass 2 semantic enrichment without breaking pass 1
usefulness.

**Code focus**: LSP adapter, upgrade-in-place logic for resolved edges, UI refresh for
enriched nodes.

**Independent proof**: pass 1 graph appears immediately, then resolved semantic edges
upgrade live.

#### S8 — Hello Diagnostics

**Spec focus**: fuse VS Code diagnostics into the graph.

**Code focus**: diagnostics ingestion, graph annotations, diagnostic overlays or
filters.

**Independent proof**: symbols with VS Code errors or warnings are visible and
queryable in the graph.

#### S9 — Hello Git

**Spec focus**: introduce git-derived recency and authorship signals.

**Code focus**: Git API integration, file metadata updates, recency visualization.

**Independent proof**: graph nodes can be colored or filtered by git recency.

#### S10 — Hello Blast Radius

**Spec focus**: combine git diff plus reverse graph traversal into Dextree's first
killer feature.

**Code focus**: changed-line-to-symbol mapping, reverse traversal, scoring,
core-file warnings, blast-radius panel.

**Independent proof**: compare against `main`, show changed symbols, affected
neighbors, score, and core-file hits.

### Phase 3: v0.3 more surfaces

**Dependency rule**: only expand surfaces after the shared graph contract and the
extension-host flow are already dependable.

#### E1 — Canvas / PNG / PDF / SVG exports

**Spec focus**: expand from Mermaid to durable export adapters.

**Code focus**: serializer adapters, artifact theming, export commands.

#### E2 — MCP server

**Spec focus**: expose the shared graph to external agents without creating a second
schema.

**Code focus**: MCP tools/resources over the same query layer.

#### E3 — Settings UI webview

**Spec focus**: move beyond raw VS Code settings for Alfred and export controls.

**Code focus**: settings webview, SecretStorage integration, config preview.

### Phase 4: v0.4 Alfred

**Dependency rule**: Alfred should come after the graph and query model are useful on
their own; otherwise the LLM layer will hide core product gaps.

#### S11 — Hello Alfred

**Spec focus**: run one prompt over graph data with explicit opt-in and preview.

**Code focus**: provider abstraction, prompt loading, query execution, preview/send
flow.

**Independent proof**: `architecture-overview` generates a markdown result from the
current graph.

#### S12 — Built-in prompt library

**Spec focus**: make Alfred useful through prompt coverage, not just plumbing.

**Code focus**: prompt packaging, validation, UX for prompt discovery and execution.

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
