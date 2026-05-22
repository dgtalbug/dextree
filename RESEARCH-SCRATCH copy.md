# Dextree Research Scratch

Generated: 2026-05-22
Scope: read-only audit of the current Dextree repo plus current public competitor signal.
Constraint: no repo files changed other than this scratch document. `ROADMAP.md` intentionally left untouched.

## 0. Review Frame

### System context

- System type: VS Code-first developer tool, local indexer, local graph store, planned MCP/export/LLM surfaces.
- Architectural maturity: pre-alpha, small-team / solo-friendly codebase, local-first, no cloud operating layer yet.
- Review lenses selected for this pass:
  - Release truthfulness and reliability
  - Product moat and competitor differentiation
  - Roadmap sequencing and execution risk

### Method

- Read source-of-truth project docs first: `.dextree/rules.md`, `.dextree/design.md`, `CLAUDE.md`, `ROADMAP.md`, `specs/008-hello-workspace/spec.md`, `specs/008-hello-workspace/tasks.md`.
- Audited live implementation under `packages/core` and `packages/extension`.
- Checked current test and coverage artifacts.
- Compared against current public signals for GitNexus, codegraph, CodeIndexer, CodeGraphy, aider, SCIP, duckdb-vscode, plus adjacent references Code Pathfinder and Continue.
- Used immutable competitor commit snapshots where available.

## 1. Executive Summary

### Bottom line

Dextree is a credible internal alpha, but it is not yet an honest public pre-release under the current docs and roadmap.

The strongest part of the repo is not the full platform story. It is the narrower thing that already exists:

- a VS Code-native graph view,
- backed by a persisted local DuckDB cache,
- with workspace indexing,
- safe reopen validation,
- and a respectable interaction baseline.

The weakest part of the repo is not the code. It is truth drift:

- the roadmap is stale,
- the README overpromises some surfaces and underreports actual maturity,
- the design doc describes a seven-package DuckPGQ/plugin platform that the repo does not yet implement,
- and the competitive baseline in the design doc is already outdated.

### Ship / no-ship

- Public pre-release using the current README / roadmap / marketplace copy: `No`.
- Internal dogfood / private alpha with a narrow truthful message: `Yes`.
- Fastest path to a credible public alpha:
  1. Truth-sync docs, roadmap, and manifest copy.
  2. Either ship Mermaid export or stop claiming it in `v0.1`.
  3. Repair the spec/code mismatch around workspace progress and cancellation.
  4. Add minimum viable index freshness beyond manual re-index.
  5. Land one real moat signal from VS Code data fusion before leaning harder into Alfred / platform sprawl.

### High-confidence conclusion

Dextree should stop presenting itself as a seven-surface platform in the near term and instead ship a brutally honest `v0.1-alpha` around one primary loop:

- index workspace,
- inspect graph in VS Code,
- reopen safely from cache,
- export one artifact,
- prove one differentiated lens.

## 2. What Is Actually Real Today

These capabilities are concretely present in the repo today.

- Only two packages exist: `packages/core/` and `packages/extension/`.
- The extension can index a workspace and persist a local DuckDB-backed cache.
- Cache identity and reopen validation are implemented.
- The graph webview exists, including fallback rendering, hover neighborhood highlighting, and PageRank-based node sizing.
- The tree view exists.
- The extension package can bundle platform-specific DuckDB native binaries into a `.vsix`.
- The current implementation is local-first; the planned remote / LLM / MCP surfaces are mostly still roadmap material.

Primary evidence:

- Package inventory: `packages/` contains only `core/` and `extension/`.
- Cache validation: `packages/core/src/storage/workspaceCache.ts` and `packages/extension/src/commands/openGraphView.ts`.
- Graph UI: `packages/extension/src/webview/App.tsx`, `packages/extension/src/webview/components/GraphView.tsx`, `packages/extension/src/webview/components/graphHover.ts`.
- Workspace indexing: `packages/extension/src/commands/indexWorkspace.ts`.
- Native packaging: `packages/extension/esbuild.mjs`.

## 3. Ranked Findings

### F1. Blocker - Public docs and release copy do not match the shipped surface

The repo currently tells three incompatible stories at once:

- the product is still basically S0 scaffolding,
- `v0.1` includes Mermaid export,
- and the extension already has real workspace graph functionality.

#### Evidence

- `README.md` claims `v0.1` ships graph view, Tree-sitter indexing, and Mermaid export.
- `README.md` lists commands `Dextree: Export as Mermaid`, `Dextree: Show Blast Radius`, and `Dextree: Run Alfred Prompt…`.
- `packages/extension/package.json` contributes only these commands: `openGraphView`, `indexFile`, `indexWorkspace`, `clearWorkspaceIndex`, `clearAllIndex`.
- `packages/extension/package.json` still describes the extension as `Index one file into the shared Dextree semantic graph.` even though workspace indexing exists.
- `README.md` also says `The monorepo scaffold is being established (Slice S0)` even though specs 007 and 008 already exist and the repo contains working workspace-scale graph functionality.

#### Why it matters

For a pre-release, trust is the product. A repo can be incomplete and still credible. It cannot be simultaneously understated and overstated.

#### Recommendation

- Rewrite all public-facing copy around the truth of the current product loop.
- Do not mention Mermaid, blast radius, Alfred, MCP, Canvas/PDF/SVG, or multi-surface platform value as shipped unless the feature exists in this repo.
- Reposition `v0.1-alpha` as `VS Code-native graph exploration with persisted local cache`, not `index once, render everywhere` yet.

### F2. Blocker - `ROADMAP.md` is stale enough to mislead execution

The roadmap currently says the active work is around `003` to `006`, while the repo already contains `specs/007-persistent-workspace-cache/` and `specs/008-hello-workspace/`.

#### Evidence

- `ROADMAP.md` current slice state stops at `006-hello-graph`.
- `ROADMAP.md` says the immediate next move is to write the full S1 spec.
- The repo contains `specs/007-persistent-workspace-cache/` and `specs/008-hello-workspace/`.
- `specs/008-hello-workspace/tasks.md` shows most implementation tasks checked off, with only manual walkthrough / review / PR tasks still open.

#### Why it matters

At this point the roadmap is no longer directional context. It is an inaccurate historical artifact.

#### Recommendation

- Replace the current state section with actual slice status.
- Separate `historical slice sequence` from `current execution state`.
- Add a lightweight `release readiness` section so roadmap and release narrative cannot drift independently.

### F3. Critical - The design doc describes a platform architecture the repo does not yet implement

The design is still useful as a target, but it is no longer safe to read it as a description of current reality.

#### Evidence

- `.dextree/design.md` section 5.3 describes a seven-package layout: `core`, `extension`, `mcp`, `cli`, `web`, `exporters`, `alfred`.
- The actual `packages/` directory contains only `core/` and `extension/`.
- `.dextree/design.md` section 8.6 defines an `ExtractorRegistry`-based plugin contract.
- The current extractor implementation in `packages/core/src/parser/extractor.ts` is hard-coded around TS-like parsing plus a plain-file fallback.
- `.dextree/design.md` section 8.7 says migrations live in `core/src/storage/migrations/`; that directory does not exist.
- `.dextree/design.md` section 4.8 describes DuckDB + DuckPGQ + `vss`; the live implementation uses normalized tables and manual SQL queries in `packages/core/src/storage/schema.ts` and `packages/core/src/query/subgraph.ts`.

#### Why it matters

This is the single largest source of expectation debt in the repo. Contributors, reviewers, and future users will mis-estimate what Dextree already is versus what it intends to become.

#### Recommendation

- Treat `.dextree/design.md` as a target-state architecture, not current-state architecture.
- Add a short `implemented today` note near sections 5 and 8.
- Stop marketing DuckPGQ / plugin extractors / multi-surface package layout as present-tense facts until they exist.

### F4. Critical - Slice 008 has a real spec/code mismatch around progress and cancellation

This is not a nit. The spec explicitly requires VS Code progress API integration and `CancellationToken`; the implementation does not do that.

#### Evidence

- `specs/008-hello-workspace/spec.md` FR-002 requires a VS Code `withProgress` notification.
- `specs/008-hello-workspace/spec.md` FR-003 requires use of `vscode.CancellationToken`.
- `specs/008-hello-workspace/spec.md` CC-002 explicitly assigns `withProgress` and `CancellationToken` to the extension layer.
- `packages/extension/src/commands/indexWorkspace.ts` uses module-level `isIndexing` and `cancellationRequested` booleans and exposes `requestWorkspaceIndexingCancel()`.
- `packages/extension/src/commands/indexWorkspace.ts` does not call `vscode.window.withProgress`.
- `packages/extension/src/extension.test.ts` still mocks `withProgress`, but there is no assertion tying the shipped behavior to that contract.
- `specs/008-hello-workspace/tasks.md` nevertheless marks T008 and T010 completed.

#### Why it matters

This is a process-integrity problem, not just an implementation gap. The spec says one thing, tasks say done, tests do not enforce it, code ships another thing.

#### Recommendation

- Pick one truth source and realign the other two.
- Preferred path: implement actual `withProgress` + `CancellationToken` and keep the spec.
- Minimum acceptable path: rewrite the spec and tasks to reflect the current webview-driven progress model.

### F5. Major - The current language story is materially narrower than the docs imply

The repo recognizes several extensions, but only TS-like files receive real structural extraction.

#### Evidence

- `packages/core/src/parser/extractor.ts` maps `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.md`, `.mjs`, `.cjs` in `LANGUAGE_BY_EXTENSION`.
- `packages/core/src/index.ts` routes only TS-like languages through `extractTypeScriptFile(...)`.
- All other languages go through `extractPlainFile(...)`, which returns `symbols: []` and `imports: []`.
- `README.md` and `packages/extension/README.md` present TypeScript, JavaScript, Python, and Markdown as supported workspace inputs without explaining the semantic difference.

#### Why it matters

If Python and Markdown are only file-level nodes today, that is fine. It just needs to be said explicitly.

#### Recommendation

- Publish language support as tiers:
  - Tier A: structural symbols + imports
  - Tier B: file-only indexing
  - Tier C: planned
- Do not use the word `supported` without specifying the depth of support.

### F6. Major - Coverage reporting is not trustworthy enough to use as release evidence

There is likely a coverage pipeline or source-map problem.

#### Evidence

- `coverage/lcov.info` reports zero executed functions for `packages/core/src/query/subgraph.ts` and `packages/core/src/storage/repository.ts`.
- The repo contains direct tests for those paths in `packages/core/src/query/subgraph.test.ts` and `packages/core/src/storage/storage.test.ts` / `packages/core/src/query/files.test.ts`.
- `coverage/lcov.info` also includes `node_modules` sources and bundled native binaries under `packages/extension/dist/`, which adds noise to the artifact.

#### Why it matters

The current `coverage/` output cannot serve as high-confidence proof for `>= 70% touched file coverage` claims.

#### Recommendation

- Fix or regenerate coverage before using it for release gates.
- Exclude `node_modules`, built artifacts, and packaged native binaries from the reported coverage set.
- Add one CI assertion on the coverage file list, not just aggregate percentages.

### F7. Major - Native packaging is a real strength, but it also sets the maintenance bar much higher than the docs admit

The codebase already made an important architectural choice: native DuckDB is real and central.

#### Evidence

- `packages/core/package.json` depends on `@duckdb/node-api`.
- `packages/core/src/storage/db.ts` dynamically imports `@duckdb/node-api`.
- `packages/extension/esbuild.mjs` bundles platform-specific DuckDB native binaries for six targets plus companion shared libraries / DLLs.
- `CLAUDE.md` still says `No native deps in core`, which is now stale and contradicted by the implementation.

#### Why it matters

This is not necessarily a bad decision. In fact, `duckdb-vscode` proves the pattern is viable. But it means Dextree's packaging, CI matrix, and cross-platform QA need to be taken more seriously than a typical pure-TS extension.

#### Recommendation

- Embrace this as an explicit architecture decision instead of leaving it as doc drift.
- Write an ADR for `native DuckDB in core and extension packaging strategy`.
- Stop implying browser-ready `core` reuse until the code is actually split into a browser-safe subset and a native runtime subset.

### F8. Major - Dextree's own competitor analysis is already outdated

The design doc's competitor section is directionally useful but no longer current enough to support roadmap prioritization.

#### Evidence

- `.dextree/design.md` still describes GitNexus as `browser-only`, `limited languages`, and built on archived Kuzu.
- Current GitNexus public repo shows CLI + MCP + local server + web UI + multi-repo features, ~39.7k stars, and active development at commit `952ada70c56a233d3649f71f55c28562c019e86c`.
- `.dextree/design.md` gives codegraph a smaller framing than it now deserves; current codegraph has ~15.7k stars, self-contained install, auto-sync watchers, framework route extraction, and an active release cadence at commit `5aae9c4bbff4fe02f8284ef5f91dd9d5391027f6`.

#### Why it matters

If the market scan is stale, roadmap sequencing becomes stale too.

#### Recommendation

- Refresh the competitor section quarterly.
- Separate `things that threaten Dextree's moat` from `things that merely validate the category`.

### F9. Moderate - Dextree's actual strongest code is underrepresented in the current narrative

Some of the repo's better engineering work is hidden behind bad messaging.

#### Evidence

- `packages/core/src/storage/workspaceCache.ts` implements concrete identity-based cache validation.
- `packages/extension/src/cache/resolveCacheIdentity.ts` canonicalizes workspace paths and captures repo hints.
- `packages/extension/src/commands/openGraphView.ts` safely gates graph hydration on cache readiness.
- `packages/extension/src/webview/html.ts` ships a strict nonce-based CSP.
- `packages/extension/src/webview/components/GraphView.test.tsx` is relatively thorough for a pre-alpha UI slice.

#### Why it matters

The repo's actual strengths are local reliability, careful packaging, and a credible graph interaction foundation. Those should be the center of the alpha story.

#### Recommendation

- Reframe the alpha message around `safe local persisted graph inside VS Code`.
- Treat the future platform story as roadmap, not headline.

### F10. Moderate - The current UX is competent but not yet distinctive

The graph UI is already usable. It is not yet unmistakably Dextree.

#### Evidence

- `packages/extension/src/webview/App.tsx` provides a clean panel with stats, relation legend, recent files, and action buttons.
- `packages/extension/src/webview/components/EmptyState.tsx` gives a decent first-use preview.
- `packages/extension/src/webview/components/graphHover.ts` and PageRank sizing provide minimal graph legibility wins.

#### Why it matters

GitNexus and codegraph already own the `AI agent context` narrative. Dextree needs its interface to make the `VS Code-native graph workspace` thesis feel obviously different.

#### Recommendation

- Build explainability and narrative into the graph UI, not just layout polish.
- Use the graph to answer `why is this important?`, `why is this risky?`, and `what changed here?` directly in the editor.

## 4. Strengths Worth Protecting

These are real advantages and should not be diluted.

1. Persisted local cache identity and safe reopen behavior.
2. Local-first posture with no server dependency in the current core loop.
3. A VS Code-native graph surface instead of a browser-only side tool.
4. Solid native-binary packaging groundwork.
5. Thoughtful graph interaction primitives already in place: hover neighborhood, fallback render path, PageRank-based emphasis.
6. Security posture in the webview is better than average for an early extension due to strict CSP.

## 5. Competitor Matrix

All stars and activity notes below were checked against current public pages on 2026-05-22.

| Tool            |              Stars | Freshness snapshot                                            | Core shape                                                | Update model                                      | VS Code-native UX                                 | Agent / MCP story      | Key thing to steal                                                     | Main reason Dextree can still win                                                  |
| --------------- | -----------------: | ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GitNexus        |              39.7k | active, commit 952ada7 about 1 hour ago                       | CLI + MCP + local server + web graph                      | manual analyze, repair paths, multi-repo registry | weak inside VS Code itself                        | very strong            | multi-repo registry, setup flows, impact tooling                       | Dextree can fuse diagnostics / tests / git inside editor instead of adjacent to it |
| codegraph       |              15.7k | active, commit 5aae9c4 about 2 hours ago                      | local CLI + SQLite graph + MCP                            | native file watcher auto-sync                     | no graph-heavy in-editor UI                       | strong                 | zero-config install, file watchers, framework routes                   | Dextree can own visual graph workspace and richer editor-native overlays           |
| aider           |              45.1k | active, commit 6435cb8 last week                              | terminal pair programmer with repo map                    | repo map refresh + git workflow                   | no native graph UX                                | indirect, model-first  | RepoMap ranking and token budgeting                                    | Dextree can make importance and risk visible spatially, not just in prompt context |
| Continue        |              33.3k | active, commit cb27309 last month                             | source-controlled agent / CI checks + extension ecosystem | PR / check driven                                 | strong extension footprint, but not graph-centric | strong                 | onboarding, check workflows, extension maturity                        | Dextree can be the graph substrate, not another generic assistant shell            |
| CodeIndexer     |                  0 | stale-ish, commit fa650aa on 2025-07-15, fork behind upstream | vector-search-first monorepo with VS Code + MCP           | Merkle-tree incremental sync                      | moderate                                          | moderate               | Merkle-based incremental indexing patterns                             | Dextree should stay graph-first and local, not embedding-first                     |
| Code Pathfinder | n/a from site page | active site, MCP package v2.1.0                               | deep MCP server for semantic analysis                     | automatic local indexing                          | little UI emphasis                                | strong                 | precise call graph / dataflow explanations                             | Python-only / MCP-first leaves room for Dextree's IDE graph workspace              |
| SCIP            |                635 | active, commit 99236e3 last week                              | protocol / format, not end-user product                   | indexer-dependent                                 | none                                              | interoperability layer | export target credibility                                              | Dextree should use SCIP to interoperate, not compete as a protocol                 |
| duckdb-vscode   |                 52 | active, commit 2567e3f 2 days ago                             | VS Code data workspace on native DuckDB                   | local query-on-open                               | strong                                            | none                   | product-grade local-first VS Code + DuckDB UX and packaging discipline | Different domain, but validates native DuckDB in extension host                    |
| CodeGraphy      |                 11 | stale, commit c59a0c9 on 2023-03-12                           | old VS Code file-graph extension                          | manual                                            | yes, but old-school                               | none                   | proof that file graphs have UI demand                                  | Dextree can supersede it with semantic graph + modern UX                           |

### Immutable reference URLs

- GitNexus repo: <https://github.com/abhigyanpatwari/GitNexus>
- GitNexus commit: <https://github.com/abhigyanpatwari/GitNexus/commit/952ada70c56a233d3649f71f55c28562c019e86c>
- codegraph repo: <https://github.com/colbymchenry/codegraph>
- codegraph commit: <https://github.com/colbymchenry/codegraph/commit/5aae9c4bbff4fe02f8284ef5f91dd9d5391027f6>
- CodeIndexer repo: <https://github.com/z23cc/CodeIndexer>
- CodeIndexer commit: <https://github.com/z23cc/CodeIndexer/commit/fa650aadc3cf040fb355def276a77c783f15b2d5>
- CodeGraphy repo: <https://github.com/joesobo/CodeGraphy>
- CodeGraphy commit: <https://github.com/joesobo/CodeGraphy/commit/c59a0c931354097c6ce985aa808f06a0e89a0ba8>
- aider repo: <https://github.com/Aider-AI/aider>
- aider commit: <https://github.com/Aider-AI/aider/commit/6435cb8b1e885d7275327d4b61206b1b1618dfe1>
- SCIP repo: <https://github.com/scip-code/scip>
- SCIP commit: <https://github.com/scip-code/scip/commit/99236e35450ccd8b87fe58c38d31fd499d0ffdfa>
- duckdb-vscode repo: <https://github.com/ChuckJonas/duckdb-vscode>
- duckdb-vscode commit: <https://github.com/ChuckJonas/duckdb-vscode/commit/2567e3ffb21e37524da90bc88662fb82f9b7a922>
- Code Pathfinder MCP page: <https://codepathfinder.dev/mcp>
- Continue repo: <https://github.com/continuedev/continue>

## 6. Gap Analysis

### 6.1 Where competitors are ahead right now

1. Install and setup trust.
2. Auto-sync / incremental freshness.
3. Agent-facing integration maturity.
4. Honest product packaging and documentation.
5. Narrow but clear product message.

### 6.2 Where Dextree already has a plausible edge

1. VS Code-native graph as the primary surface.
2. Potential fusion of diagnostics, git, and tests into one spatial workspace.
3. Exportable graph artifacts from the same underlying model.
4. A local-first, persisted, re-openable graph experience rather than a session-only browser tool.

### 6.3 What is still only a potential edge, not a delivered one

1. Diagnostics fusion.
2. Test linkage.
3. Git recency / authorship overlays.
4. Blast radius inside the graph.
5. Export studio.
6. MCP backed by the same graph contract.

If these remain roadmap-only, Dextree is not yet differentiated enough against GitNexus and codegraph to justify broad positioning.

## 7. Roadmap Decision Calls

These are the explicit sequencing judgments from this audit.

### 7.1 Should incremental indexing move earlier than the current roadmap suggests?

`Yes.`

Manual re-index is acceptable for internal demos. It is weak for public alpha because both GitNexus and codegraph already teach users to expect freshness. I would not block the first truthful alpha on full watcher sophistication, but I would insert a minimal `auto-sync / changed-files-only` slice before any Alfred work and before heavy export polish.

### 7.2 Should RepoMap-like ranking / importance move earlier?

`Yes, but as explainable UX, not just a hidden score.`

PageRank is already in the repo. The next move is not more ranking math. It is exposing `why this node is important`, `show top central files`, and `focus core hot spots` directly in the UI.

### 7.3 Should SCIP come before Canvas / PNG / PDF?

`Yes.`

After Mermaid, SCIP is the more strategic export because it creates interoperability and credibility at lower product-polish cost than PDF narrative or visual artifact studio work. Canvas / PNG / PDF / SVG should come later, once the graph model and theme system are stable.

### 7.4 Should MCP move earlier?

`Yes, slightly earlier.`

MCP should land before the heavier export family and well before Alfred. Dextree does not need to beat GitNexus on MCP breadth immediately, but it should expose the same graph contract once the core query surface is stable.

### 7.5 Should multi-repo move earlier?

`No.`

Multi-repo is a complexity trap this early. GitNexus already owns that expectation. Dextree should first dominate the single-repo, in-editor, explainable graph workflow.

### 7.6 Should Alfred move earlier?

`No.`

The repo is not ready to hide product gaps behind narrative generation. Alfred should remain late.

### 7.7 Should the Vite-embeddable component move earlier?

`No.`

It is downstream of a stable graph contract and artifact theme system. It should not compete for focus with the extension's primary UX loop.

## 8. Proposed Roadmap Delta

This is a proposed replacement direction for `ROADMAP.md`. It is intentionally not applied directly.

### 8.1 Immediate delta to current roadmap

- Remove the stale `Current Slice State` table.
- Add actual states for slices `007` and `008`.
- Add a `Release Truth` slice before any more platform expansion.
- Split `exports` into `Mermaid first`, `SCIP second`, `artifact family later`.
- Move `MCP` earlier than `Canvas / PNG / PDF / SVG`.
- Insert `incremental freshness / auto-sync` before Alfred and before broad external positioning.

### 8.2 Recommended sequence from current repo state

1. `R0 - Release Truth Sync`
   - Sync README, extension metadata, roadmap, and package docs to what actually exists.
   - Define support tiers and release vocabulary.

2. `R1 - Hello Mermaid`
   - Either ship it and keep the `v0.1` claim, or remove it from all public surfaces.

3. `R2 - Incremental Freshness`
   - Changed-file reindex and a minimal watcher story.
   - Not perfect. Just enough to avoid constant manual reindex.

4. `R3 - First Real Moat Signal`
   - Diagnostics overlay or Git recency overlay.
   - I would choose diagnostics first for immediate editor-native differentiation.

5. `R4 - Blast Radius`
   - Pair with Git integration once changed-symbol mapping is credible.

6. `R5 - MCP`
   - Expose the same graph to agents.
   - Keep the tool surface narrow and trustworthy at first.

7. `R6 - SCIP Export`
   - Interoperability before glossy artifacts.

8. `R7 - Artifact Studio`
   - Canvas / PNG / PDF / SVG once theme tokens and graph contract are stable.

9. `R8 - Alfred`
   - Narrative layer only after the graph is already useful on its own.

10. `R9 - Multi-repo / web component`

- Explicitly late.

### 8.3 What I would market as `v0.1-alpha`

- Workspace indexing
- Persisted local cache and safe reopen
- Tree view + graph view
- Hover neighborhood and importance sizing
- One export target: Mermaid
- Honest language support tiers

That is enough for a real alpha if presented truthfully.

## 9. Hot Paths and Validation Status

This section separates `widely used`, `actually tested`, and `coverage artifact says weird things`.

| Path / symbol                 | Usage pressure | Validation state                  | Notes                                                                |
| ----------------------------- | -------------- | --------------------------------- | -------------------------------------------------------------------- |
| `replaceFileGraph`            | high           | tested, but lcov misreports       | referenced across core indexer and multiple query/storage tests      |
| `getWorkspaceSubgraph`        | high           | tested, but lcov misreports       | core query tests exist; graph hydration depends on it                |
| `validateWorkspaceCache`      | medium-high    | tested                            | important reliability path for safe reopen                           |
| `resolveCacheIdentity`        | medium-high    | tested                            | central to cache reuse and graph hydration                           |
| `createIndexWorkspaceCommand` | medium-high    | tested, but spec mismatch remains | tests cover current custom cancel model, not `withProgress` contract |
| `activate`                    | high           | tested                            | extension bootstraps cache validation and command registration       |

### Notes

- `getWorkspaceSubgraph` has 11 usages including core and test references.
- `replaceFileGraph` has 27 usages including the core indexer and multiple tests.
- `validateWorkspaceCache` has 8 usages and concrete storage tests.
- `createIndexWorkspaceCommand` has 12 usages; the gap is not `no tests`, it is `tests validate the wrong contract`.

## 10. UI / UX Differentiation Analysis

### 10.1 Current UX assessment

The current webview is clean and competent. It is not yet category-defining.

What already works:

- Strong empty-state framing for a pre-alpha tool.
- Good use of native VS Code visual language.
- Useful at-a-glance stats.
- Action buttons are obvious.
- Hover neighborhood and importance sizing make the graph less blob-like.

What is missing for differentiation:

- no guided interpretation,
- no `why this matters` explanations,
- no focus lenses beyond raw graph exploration,
- no change or quality overlays,
- no memorable artifact / story mode,
- no first-run path from blank state to `aha` moment beyond `Index Workspace`.

### 10.2 Differentiating UI features — 21 concrete proposals

The 12 high-level ideas (D1–D12 below) are kept verbatim from the original audit. Twenty-one grounded specs (G1–G21) follow them with target ROADMAP slices using the **active ROADMAP.md naming** (S3.5, S4, S6, S6.5, S7, S7.5, S8, S10, S10.5, S10.7, S11, S11.5, S11.7, E1, E2, E3) and prior-art file:line citations. §10.3 maps D1–D12 → G1–G21.

#### 10.2.a Original 12 high-level ideas (kept)

1. Evidence drawer
   - Click a node and show exact reasons: callers, imports, diagnostics, last edit age, tests touching it.

2. Focus lenses
   - One-click views for `central files`, `recently changed`, `untested`, `diagnostic-heavy`, `core files`.

3. Why-is-this-big?
   - Hover a PageRank-sized node and show the top contributing incoming relations.

4. Risk ribbon
   - A top bar that can switch the whole graph into `diagnostics`, `git churn`, `blast radius`, or `test gap` mode.

5. Neighborhood stack
   - Let users drill from workspace graph to subgraph to symbol cone and back with breadcrumbs.

6. Saved views
   - Pin a filtered subgraph as `Onboarding`, `Hot path`, `Auth flow`, `Refactor target`.

7. Core-file explainer
   - When something is marked or inferred as core, explain why: fan-in, git churn, diagnostics, tag, or test centrality.

8. Git diff movie
   - Scrub changes over recent commits and watch graph emphasis shift over time.

9. Test and diagnostic badges on nodes
   - Tiny but high-value overlays that competitors outside VS Code cannot do as naturally.

10. Export preview studio

- Show Mermaid / SCIP / PNG output previews from the current filtered graph before export.

11. Guided first-run walkthrough

- After first successful index, animate 3 exact moves: hover, double-click, filter by lens.

12. Graph explanations written as product UI, not LLM prose

- Alfred should be optional. The UI itself should explain the graph even with zero model access.

#### 10.2.b Grounded specs G1–G21 (with target slice + prior art)

##### Theme A — Navigation & density (graph survival above 1K nodes)

- **G1. Minimap with viewport rectangle + density heat-tile.** 180×120 fixed-corner Sigma instance; `M` toggles. Effort M, target **S4** (viewport) → **S6** (density grid). Prior art: Obsidian Graph View, Figma minimap.
- **G2. Sticky breadcrumb spine during pan/zoom.** Horizontal pill row; deepest-common-ancestor cluster across viewport, debounced 150ms. Effort M, target **S6**. Prior art: Sourcegraph file breadcrumb, Linear. Maps to D5.
- **G3. Keyboard-first navigation (Linear-grade).** Single zustand `keyboardMode` slice; `/` `f` `j` `k` `h` `l` `o` `]` `[` `gg` `G` `?` bindings; `?` cheatsheet modal. Effort M, target **S4** (basic) → **S6/S11** (enriched). Prior art: Linear, Vim, Sourcegraph.
- **G4. Lens presets — saved queries as tabs.** Top-of-graph tab strip (max 7 + overflow); typed query persisted to `workspaceState`; deep-link via `vscode://dextree.dextree/lens?q=...`. Effort M, target **S7**. Prior art: Sentry saved searches, Linear views. **Concrete spec for D2 + D6.**
- **G5. Drill-down flame frame (Sentry-style).** `D` on selected function → React Flow icicle of callee tree, depth ≤5, ≤200 nodes; framer-motion slide-up. Effort L, target **E1** (after PageRank S11.7 + LSP S8). Prior art: Sentry flame graphs.
- **G6. Hover-card mini-LSP.** 240ms hover → 320×auto popover; signature + first non-empty doc line + flag badges + 3 keyboard hints. Effort S, target **S4** basic → **S8** enriched. Prior art: VS Code hover, Sourcegraph Cody. **Lightweight version of D1.**
- **G7. LOD label policy.** Sigma `labelRenderedSizeThreshold` driven by zoom + PageRank; selected neighborhood always labeled. Effort S, target **S4** (required for 1K+ nodes). Prior art: Sigma.js LOD demo, deck.gl.

##### Theme B — Temporal & diff

- **G8. Time-travel slider (commit replay).** Bottom slider, `T` toggles; per-commit ticks; drag → diff against next snapshot, framer-motion staggered 15ms; 1×/2×/8× playback. `commit_snapshot` table stores deltas. Effort L, target **S10**. Prior art: GitHub repo visualizer, CodeSee, Gource. **Concrete spec for D8.**
- **G9. Side-by-side snapshot diff.** Vertical splitter; left = base, right = head; linked cameras with lock codicon; added glow green, removed ghost-outline red. Effort L, target **S11** (overlaps Blast Radius). Prior art: GitHub PR diff, Sourcegraph batch changes.
- **G10. Churn ribbon under canvas.** 24px ribbon, one column per week (last 26); height = commits, color = author diversity. Effort M, target **S10**. Prior art: GitHub activity graph, Linear cycle velocity.

##### Theme C — Cross-cutting overlays

- **G11. Heat-overlay toggle stack.** Vertical icon column right edge; radio toggles for error/churn/coverage/complexity/pagerank; keyboard `1`–`5` cycles; `color-mix(in oklch, ...)` for theme-aware gradients. Effort M, target **S9 → S10 → S11** layered; foundation S6. Prior art: CodeSee, Sentry heatmaps. **Concrete spec for D4 + D9.**
- **G12. "Why is this here?" edge inspector with inline source.** Click edge → 320px right drawer; 5-line code snippet around call site, syntax-highlighted via host-side VS Code tokenization sent over message bridge; "Open in editor" + "Show all N call sites" pager. Effort M, target **S8** (resolved sites) — stubbed S6 with "open file". Prior art: Sourcegraph references panel, JetBrains call hierarchy. **Edge-level concrete spec for D1.**
- **G13. Blame-the-graph overlay.** Hold `B` while hovering → top 3 commits touching the file; click → VS Code's git log view. Effort S, target **S10**. Prior art: GitLens, GitHub blame. **No competitor has this on a graph — wedge.**
- **G14. Annotation layer (sticky-note pins on nodes).** Right-click node → "Pin annotation" → 280px markdown editor inline; stored in `.dextree/annotations.json` (committable); `A` toggles. Effort M, target **E1** (file format defined S6). Prior art: CodeSee tours, Figma comments. **Nothing in IDE-graph space has this — strongest wedge.**
- **G15. Reverse architecture — minimum path finder.** `Dextree: Find path between symbols…` quickpick; BFS both directions, depth 8 / branching 64 cap; weighted shortest path; directional shimmer along edges. Effort M, target **S7**. Prior art: LinkedIn "How you're connected", BloodHound, Sourcegraph code-graph.

##### Theme D — Onboarding & empty states

- **G16. Spotlight onboarding (5 most central nodes).** First-ever graph open: everything except top-5 PageRank fades to 6% alpha; numbered chip card with codicon checkmarks. Re-entry via `Dextree: Show onboarding`. Effort S, target **S6**. Prior art: Linear onboarding, Vercel first-deploy tour. **Concrete spec for D11.**

##### Theme E — Stolen from competitors (added 2026-05-22, post-audit)

Five gaps the original 16 missed after re-reading GitNexus's `gitnexus-web/src/components/` (25+ components) and Aider's `aider/repomap.py`. We steal the _interaction model_, not the libraries — locked rules hold (no Tailwind, no lucide, no Mermaid-in-webview).

- **G17. Community / cluster overlay with auto-grouping.** Louvain communities computed at index time via `graphology-communities-louvain`; persisted as `community_id` column on `symbol`; nodes colored by community index; soft convex hulls behind clusters via Sigma reducers; `C` toggles hulls. Effort S, target **S11.7** (shares graphology recompute with PageRank). Prior art: GitNexus [`gitnexus-web/src/components/GraphCanvas.tsx:175-191`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/GraphCanvas.tsx) — `MEMBER_OF` edges to `Community` nodes; Aider uses `nx.community` to chunk the repo-map. **Concrete spec for D3 + D7** — community membership IS the "why".
- **G18. Process / execution-flow panel.** Left-side panel groups detected execution flows by cross-community vs intra-community; clicking opens a side-panel detail (NOT Mermaid in the webview — locked-rule violation) with step list + "Focus in graph" action. Mermaid is the _export_ path (S7), not the render path. Effort M, target **S11.5** (routes ARE processes). Prior art: GitNexus [`ProcessesPanel.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/ProcessesPanel.tsx) + `ProcessFlowModal.tsx`.
- **G19. PGQ / SQL query console (FAB).** Codicon `terminal` FAB bottom-right of graph; opens a slide-up panel with Monaco (free — already in VS Code) using a custom `dextree.pgq` language config; prefab dropdown of canned queries; results in plain HTML `<table>` (no `@tanstack/react-table` without rules amendment); matched nodes highlight in graph. **The §4.8 PGQ moat is invisible without this UI.** Effort M, target **new sub-slice S7.5** (depends on H5 PGQ feasibility passing — falls back to plain SQL if PGQ fails). Prior art: GitNexus [`QueryFAB.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/QueryFAB.tsx).
- **G20. Named pipeline-phase progress.** Replace S6's generic "Discovering / Parsing / Writing" with explicitly-named phases (`scan → parse → persist → resolve → index`); pass-2 adds (`lsp → diagnostics → git → pagerank → community`); render as a horizontal stepper inside `withProgress` notification; each phase has its own elapsed timer. Turns a black-box wait into a debug story. Effort S, target **S6** (modify the existing `withProgress` call). Prior art: GitNexus [`AnalyzeProgress.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/AnalyzeProgress.tsx) — 14 named phases.
- **G21. Repo-map text view (Aider-style).** `Dextree: Show repo-map` command opens a virtual markdown doc built from PageRank top-K per file; token-budgeted (default 1024, configurable). Not a graph — a precise textual snapshot for `Cmd-F` and copy/paste into chat. Becomes the default system prompt for every Alfred prompt in v0.4. Effort S, target **S12** (Alfred prerequisite). Prior art: Aider [`aider/repomap.py:368-540`](/tmp/dextree-research/aider/aider/repomap.py) — the _only_ reason Aider scales to large repos. **Concrete answer to D12** — the repo-map IS the non-LLM explanation.

### 10.3 Mapping D1–D12 → G1–G21

| § 10.2.a high-level          | Concrete grounded spec(s)                                           |
| ---------------------------- | ------------------------------------------------------------------- |
| D1 Evidence drawer           | G6 hover-card (transient) + G12 edge inspector + G13 blame-on-hover |
| D2 Focus lenses              | G4 lens presets                                                     |
| D3 Why-is-this-big?          | G17 community membership = the "why"                                |
| D4 Risk ribbon               | G11 heat-overlay toggle stack                                       |
| D5 Neighborhood stack        | G2 sticky breadcrumb + G15 path finder                              |
| D6 Saved views               | G4 lens presets (same concept, formalized)                          |
| D7 Core-file explainer       | G17 community + PageRank exposure from S11.7                        |
| D8 Git diff movie            | G8 time-travel slider                                               |
| D9 Test / diagnostic badges  | G11 heat-overlay (badge variant)                                    |
| D10 Export preview studio    | ROADMAP S7 theme picker + Mermaid preview                           |
| D11 Guided walkthrough       | G16 spotlight + 3-step VS Code walkthrough in S6                    |
| D12 Graph explanations as UI | G21 repo-map text view + G14 annotation layer                       |

### 10.4 Stealing-cleanly rules (operating constraints)

Three rules to keep the borrowing honest:

- **Steal the pattern, not the framework.** GitNexus's Tailwind + lucide-react + Mermaid-in-webview can't ship here. We steal the interaction model (modal flow viewer, FAB query console, named pipeline phases). We don't steal the libraries.
- **Cite the source in the spec.** Every borrowed pattern lands in a SpecKit spec with a `Prior art:` line pointing at the cloned-repo file path. Reviewer can verify we adapted, not copied.
- **Re-check the locked rules before each.** §12 of design.md and RULE-LIB-001..006 are the hard wall. G19 PGQ console is trickiest: Monaco is free (VS Code ships it), but a results-table component pushes toward a table library. Use plain HTML `<table>` with CSS Modules; don't import `@tanstack/react-table` without a rules-amendment PR first.

## 11. Theme Token Spec For Dextree Artifacts

The theme system should not be a bag of CSS variables. It should be a portable artifact contract that the webview and exporters can both consume.

### 11.1 Token groups

```json
{
  "$schema": "https://dextree.dev/theme.schema.json",
  "meta": {
    "name": "Dextree Default",
    "version": 1,
    "mode": "dark"
  },
  "surface": {
    "canvas": "#0e1414",
    "panel": "#162020",
    "panelAlt": "#1d2a2a",
    "card": "#223131",
    "border": "#344646",
    "shadow": "rgba(0, 0, 0, 0.28)"
  },
  "text": {
    "primary": "#e8efe9",
    "muted": "#a9bbb4",
    "inverse": "#091010",
    "link": "#6ec6b8"
  },
  "graph": {
    "node": {
      "file": "#7fc4ff",
      "symbol": "#f7a85c",
      "core": "#ff6b57",
      "selectedRing": "#f3f1d7",
      "hoverHalo": "rgba(243, 241, 215, 0.25)",
      "dimAlpha": 0.15
    },
    "edge": {
      "defines": "#5c9dff",
      "imports": "#64d2a3",
      "calls": "#ffb25c",
      "risk": "#ff6b57",
      "dimAlpha": 0.15
    },
    "scale": {
      "nodeMin": 6,
      "nodeMax": 20,
      "importanceCurve": 1.15,
      "edgeWidth": 1.5,
      "selectedEdgeWidth": 2.5
    }
  },
  "status": {
    "success": "#64d2a3",
    "warning": "#f7a85c",
    "error": "#ff6b57",
    "info": "#7fc4ff"
  },
  "artifact": {
    "mermaidBackground": "#0e1414",
    "mermaidPrimary": "#7fc4ff",
    "mermaidAccent": "#f7a85c",
    "mermaidText": "#e8efe9",
    "pdfBackground": "#f6f3eb",
    "pdfText": "#1f2624"
  },
  "motion": {
    "fastMs": 120,
    "normalMs": 180,
    "slowMs": 280,
    "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
  }
}
```

### 11.2 Palettes

#### Palette A - Workbench Ember

```json
{
  "name": "Workbench Ember",
  "mode": "dark",
  "surface": { "canvas": "#131416", "panel": "#1d1f22", "card": "#272b30", "border": "#3a4047" },
  "text": { "primary": "#f2eee7", "muted": "#b7ada0", "link": "#8bc7ff" },
  "graph": {
    "node": {
      "file": "#7ab8ff",
      "symbol": "#ff9a56",
      "core": "#ff6154",
      "selectedRing": "#ffe7c8"
    },
    "edge": { "defines": "#5f95ff", "imports": "#74d6a2", "calls": "#ffb85c", "risk": "#ff6154" }
  }
}
```

#### Palette B - Paper Circuit

```json
{
  "name": "Paper Circuit",
  "mode": "light",
  "surface": { "canvas": "#f6f3eb", "panel": "#efe9dd", "card": "#ffffff", "border": "#d0c4b3" },
  "text": { "primary": "#2b302b", "muted": "#6d736a", "link": "#1469a9" },
  "graph": {
    "node": {
      "file": "#2c78c4",
      "symbol": "#bd6a1f",
      "core": "#bf3f34",
      "selectedRing": "#6b7d3b"
    },
    "edge": { "defines": "#2c78c4", "imports": "#4e9461", "calls": "#d78a2e", "risk": "#bf3f34" }
  }
}
```

#### Palette C - Signal Harbor

```json
{
  "name": "Signal Harbor",
  "mode": "dark",
  "surface": { "canvas": "#0f1720", "panel": "#172433", "card": "#203244", "border": "#35506a" },
  "text": { "primary": "#e6f0f6", "muted": "#a2b5c6", "link": "#6ed0ff" },
  "graph": {
    "node": {
      "file": "#6ed0ff",
      "symbol": "#ffc56d",
      "core": "#ff7b72",
      "selectedRing": "#a3e635"
    },
    "edge": { "defines": "#64a8ff", "imports": "#2dd4bf", "calls": "#ffc56d", "risk": "#ff7b72" }
  }
}
```

#### Branded preset - Dextree Grove

```json
{
  "name": "Dextree Grove",
  "mode": "dark",
  "surface": { "canvas": "#0d1715", "panel": "#15221f", "card": "#1d2e2b", "border": "#31504a" },
  "text": { "primary": "#e7f0ea", "muted": "#a3b7ad", "link": "#6fd2bd" },
  "graph": {
    "node": {
      "file": "#7cc7ff",
      "symbol": "#e89a52",
      "core": "#ff6b57",
      "selectedRing": "#d7f0a4"
    },
    "edge": { "defines": "#63a7ff", "imports": "#69d3a7", "calls": "#f4b96f", "risk": "#ff6b57" }
  },
  "brand": { "accent": "#6fd2bd", "accentWarm": "#e89a52", "accentRisk": "#ff6b57" }
}
```

## 12. First-Time User Journey Audit

| Step                  | Current state                                          | Friction                                                   | Recommendation                                                        |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Install / readme      | message is inconsistent                                | user cannot tell what is shipped versus aspirational       | tighten release truth immediately                                     |
| Open extension        | Activity Bar and Symbols view exist                    | graph value is not front-loaded enough                     | make the graph the primary first-run CTA                              |
| Empty state           | decent preview and command guidance                    | good but generic; no promise of the next `aha`             | add a 3-step walkthrough after first index                            |
| Start indexing        | command exists, progress also appears in webview state | spec/API mismatch and unclear cancellation semantics       | use one canonical progress model and explain failures / ignored files |
| First graph render    | graph works                                            | users still need interpretation help                       | add focus chips: `largest`, `recent`, `errors`, `core`                |
| Navigate from graph   | double-click and fallback button behavior exist        | the interaction is discoverable only by experimentation    | add an interaction legend or one-time tooltip                         |
| Return to graph later | safe cache validation exists                           | if cache is unreadable or not ready, fallback feels silent | explain the state and present exact remediation action                |

### Journey verdict

The first-run flow is close to functional but still missing one strong narrative handhold. Users can technically reach value. They are not yet guided to it.

## 13. Specific Things To Steal From Competitors

Each entry cites the source file path inside the cloned `/tmp/dextree-research/<repo>/` tree so a reviewer can verify we adapted, not copied. Patterns map to a target ROADMAP slice using the active naming. The five new "stolen" UI patterns (G17–G21) appear under their source competitor below.

### 13.1 From codegraph (MIT, 15.7k ⭐, active)

- **Self-contained installer + auto-sync watcher** — native FS watcher with FSEvents/inotify/RDCW debounce + per-file content-hash skip. Source: [`src/sync/`](/tmp/dextree-research/codegraph/) + [`src/db/schema.sql`](/tmp/dextree-research/codegraph/src/db/schema.sql) (`files.content_hash`). **Steal into:** ROADMAP **S6.5 Auto-sync watcher** + **S6** hash-skip acceptance criterion.
- **MCP tool taxonomy** — `codegraph_search / context / callers / callees / impact / node / explore / status / files`. Source: [`src/mcp/tools.ts:278-438`](/tmp/dextree-research/codegraph/src/mcp/tools.ts). **Steal into:** ROADMAP **S10.7** (read-only MCP) tool surface design. Mirror the names where they fit Dextree's graph.
- **14 framework resolvers shipped as folders** — `src/resolution/frameworks/{cargo-workspace, csharp, drupal, express, go, java, laravel, nestjs, python, react, ruby, rust, svelte, swift, vue}`. Source: [`src/resolution/frameworks/`](/tmp/dextree-research/codegraph/). **Steal into:** ROADMAP **S11.5 Framework route map** (start with Express + NestJS + FastAPI + Flask + Spring per scratch's 5-to-start scope).

### 13.2 From GitNexus (PolyForm-NC, 39.7k ⭐, active)

- **Named pipeline-phase progress** — 14 explicitly-named phases (`cloning → extracting → structure → parsing → imports → calls → heritage → communities → processes → embeddings → done`) each with its own label + elapsed timer. Source: [`gitnexus-web/src/components/AnalyzeProgress.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/AnalyzeProgress.tsx). **Steal into: G20** → ROADMAP **S6** (replace the generic 3-phase `withProgress` with a 5+ phase stepper).
- **PGQ / Cypher query FAB** — bottom-right floating button opens a Cypher console with 5 prefab queries (`MATCH (n:Function) RETURN ...`); results highlight matched nodes in the graph. Source: [`gitnexus-web/src/components/QueryFAB.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/QueryFAB.tsx). **Steal into: G19** → new ROADMAP sub-slice **S7.5** (depends on H5 PGQ feasibility smoke test passing). Without this UI the §4.8 PGQ moat is invisible.
- **Community / cluster visualization** — Louvain communities materialized as `Community` nodes with `MEMBER_OF` edges; nodes colored by community index; passed to Sigma via graph-adapter. Source: [`gitnexus-web/src/components/GraphCanvas.tsx:175-191`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/GraphCanvas.tsx). **Steal into: G17** → ROADMAP **S11.7** (shares graphology recompute with PageRank). Use `graphology-communities-louvain` (already allowed under RULE-LIB-002).
- **Process / execution-flow surface** — left panel groups detected processes by cross-community / intra-community; click opens a side detail with step list + "Focus in graph". Source: [`gitnexus-web/src/components/ProcessesPanel.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/ProcessesPanel.tsx) + `ProcessFlowModal.tsx`. **Steal into: G18** → ROADMAP **S11.5** (routes ARE processes). **Do not steal:** the Mermaid-in-webview render path — that violates RULE-LIB-002. Mermaid is the _export_ path only (S7).
- **Setup ergonomics + repository registry** — `RepoLanding.tsx`, `OnboardingGuide.tsx`, copy-to-clipboard install snippets, clear "what gets sent" surfacing for AI integrations. Source: [`gitnexus-web/src/components/OnboardingGuide.tsx`](/tmp/dextree-research/GitNexus/gitnexus-web/src/components/OnboardingGuide.tsx). **Steal into:** ROADMAP **S6** 3-step VS Code walkthrough + **E2** auto-config installer for Claude/Cursor/Codex.

### 13.3 From aider (Apache-2.0, 45.1k ⭐, active)

- **PageRank-driven repo-map in a token budget** — `~170 LOC` NetworkX MultiDiGraph + `nx.pagerank` + personalization vector built from "mentioned identifiers" + token-budgeted Markdown output. Source: [`aider/repomap.py:368-540`](/tmp/dextree-research/aider/aider/repomap.py). **Steal twice:**
  - The **algorithm** → ROADMAP **S11.7 PageRank symbol ranking** (port to graphology, write back to `symbols.pagerank`).
  - The **output format** → **G21** → ROADMAP **S12** Alfred prerequisite. The non-graph text view is what makes Aider scale.

### 13.4 From CodeIndexer (MIT, 11.5k ⭐, stale ~10mo)

- **Merkle-tree changed-file detection** — SHA-256 leaves persisted to `~/.codeindexer/merkle/<hash>.json`. Source: `packages/core/src/sync/{merkle.ts, synchronizer.ts}` (`/tmp/dextree-research/CodeIndexer/`). **Steal into:** ROADMAP **S6** as the optional acceleration when hash-only isn't enough on 10K+ file repos (the spec already references this as "inspirational"; keep the optionality).

### 13.5 From duckdb-vscode (MIT, 52 ⭐, scope mismatch)

- **DuckDB-in-VS-Code as a viable distribution path** — proves `@duckdb/node-api` runs in the extension host across the supported platform matrix. Source: [`/tmp/dextree-research/duckdb-vscode/`](/tmp/dextree-research/duckdb-vscode/). Not a UI pattern; cite as **architecture validation** for the F-POS storage choice in the audit, and as the precedent to point at if anyone questions the platform bet.

### 13.6 From Continue (referenced in original audit, not cloned)

- **Source-controlled config + trust mechanics** — `.continue/config.json` checked into the repo; user pull-model on telemetry. **Steal into:** ROADMAP **S6** `.dextree/annotations.json` policy (G14) + the Telemetry pull-model in **E3** (`Dextree: Share usage report` command, no SDK, no network).

### 13.7 From Code Pathfinder (no canonical URL supplied)

- **Explainable semantic analysis framing** — naming pattern: avoid "AI understands your code"; prefer "shows you the exact reason X depends on Y." **Steal into:** marketing copy across the README and `displayName` / `description` in `package.json`. This is a _positioning_ steal, not a code one. **Maps to D12** (Graph explanations as product UI, not LLM prose) and reinforces **G21** (repo-map text view).

### 13.8 What we explicitly chose NOT to steal

- **Tailwind + lucide-react + Mermaid-in-webview** (GitNexus) — banned by RULE-LIB-002/005/006. Steal the patterns, not the libraries.
- **Per-language hand-rolled resolver** (GitNexus + codegraph each ship ~24k LOC of custom resolution) — Dextree uses LSP instead (design §4.4). Lower long-term burden, higher per-language accuracy.
- **Embedding-first semantic recall** (CodeIndexer) — defer to V1 (v0.5+) per ROADMAP. Don't anchor v0.1's value on embeddings.
- **PolyForm-Noncommercial license** (GitNexus) — Dextree stays MIT.

## 14. Specific Things Not To Copy

1. Do not lead with generic `AI coding assistant` language. Dextree loses that fight.
2. Do not add multi-repo before single-repo freshness and moat signals are solid.
3. Do not ship Alfred early just to sound modern.
4. Do not overbuild artifact polish before interoperability and truthfulness.
5. Do not pretend the current repo is already the seven-package platform in the design doc.

## 15. Suggested ADRs After This Audit

These should become explicit architecture decisions once the team is ready to update repo docs.

1. ADR: Current-state versus target-state architecture docs.
2. ADR: Native DuckDB in core plus extension packaging strategy.
3. ADR: Release truth policy for README, roadmap, and marketplace metadata.
4. ADR: Incremental indexing before Alfred.
5. ADR: SCIP before artifact family expansion.

## 16. Final Recommendation

The repo should proceed, but with a narrower, sharper bar.

The right move is not to slow down implementation and not to broaden the platform story. The right move is to make the current truth coherent, then add exactly the next few things that strengthen Dextree's unique angle:

- one honest alpha message,
- one export,
- one freshness improvement,
- one real VS Code-native moat signal,
- one agent surface.

If that happens, Dextree has a real lane:

`the best in-editor graph workspace for understanding and de-risking a codebase locally`.

If it does not, the project risks being perceived as a smaller, later, less mature version of tools that already own the MCP and AI-assistant narrative.
