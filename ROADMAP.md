# Dextree Roadmap — single source of truth

This is the **canonical roadmap** for Dextree. There is **one** roadmap. Update this file when scope shifts.

> Renamed from `ROADMAP-v2.md` on 2026-05-24 after consolidation. Prior draft `ROADMAP.md` and `scratch/ROADMAP.md` were merged into this file and deleted.

It consolidates:

- The live slice / status tracking from the legacy `ROADMAP.md`
- The sequencing corrections from `RESEARCH-SCRATCH.md`
- The GraphView redesign + Phase 0 enrichment + Mermaid v2 work from `scratch/ROADMAP.md`
- The library audit findings (sigma.js + graphology ecosystems)

**Immediate goal:** finish Hello Mermaid (S7), then resequence the rest of the roadmap so that **reaching the final-state mockup** ([scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html)) is the next thing built — before the original Phase 2 backlog. The mockup IS the spec for that work.

## Reference artefacts (not separate roadmaps)

- [scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html) — **frozen** final-state mockup; the spec for the GraphView redesign slices below
- [scratch/graphview-db-relations.md](scratch/graphview-db-relations.md) — DB schema reference + per-column "wired vs unused" audit
- [scratch/mermaid-diagram-types-audit.md](scratch/mermaid-diagram-types-audit.md) — per-diagram-type data audit + render formulas + validators
- [scratch/graphview-mockup-v2.html](scratch/graphview-mockup-v2.html) — earlier iteration mockup (diff reference)
- [RESEARCH-SCRATCH.md](RESEARCH-SCRATCH.md) — competitive audit, prior-art notes, source for many slice decisions

---

## 1. Planning standard

### Product rule

Ship **truth before breadth**:

1. The graph contract must be honest.
2. The local VS Code loop must be fast and reliable.
3. **Then** finish the mockup — the redesigned GraphView is the immediate post-S7 goal.
4. Only **after** the mockup is real should Dextree expand into the deeper moat overlays (LSP, diagnostics, git, MCP, route maps, etc.).

### Execution rule

- Max **one active implementation slice** at a time.
- Max **one active spec / clarification slice** at a time.
- Branch-local code does **not** automatically change roadmap priority.
- Pass 1 must stay useful before pass 2 arrives.
- Public docs and marketplace metadata must not advertise non-shipped behavior.

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

---

## 2. Current reality (2026-05-24)

Honest snapshot from git history + spec task lists:

| Area               | Reality                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Packages           | `packages/core`, `packages/extension`, `packages/exporters` (added in 016)                                                      |
| CI/CD              | Foundation fixes (004) + GitHub Actions (005) merged + release-truth gate (015) live                                            |
| Schema             | Schema alignment (009/S3.5) merged; `Annotation`, `Module`, `Test` tables present; migration runner active                      |
| Graph              | Hello Graph (010/S4) merged with `ExtractorRegistry` + naive `CALLS`; webview renders the graph the runtime actually writes     |
| Persistence        | Persistent workspace cache (011/S5) merged with migration 004                                                                   |
| Workspace indexing | Full-workspace indexing (012/S6) merged + auto-sync watcher (013/S6.5) merged                                                   |
| Session summary    | 014/S6.8 mostly done                                                                                                            |
| Release-truth gate | 015/S6.9 mostly done                                                                                                            |
| Hello Mermaid (S7) | **Active.** Exporters package added, serializer + theme system live, Export button in GraphView toolbar; finishing tasks remain |

**Current branch:** `016-hello-mermaid`. **Active slice:** Hello Mermaid finalisation.

---

## 3. Slice board

Renumbered to reflect git reality. Spec dir is the on-disk folder; design slice is the S-number from this roadmap.

> **How to use this board (note to future-self / next SpecKit session):**
>
> 1. Find the topmost row whose State is `next-up`. That's the spec to author next.
> 2. The `Spec dir` column gives the exact folder name to create under `specs/`.
> 3. The `Notes` column is the seed for the spec's "Scope" section — never invent new scope.
> 4. When a slice ships, flip its State to `done` and promote the next `next-up` row to `active`.
> 5. Only ONE row may be `active` at a time (per §1 execution rule).
>
> Phase 2 (S7.1 → S7.14) is the path to the [mockup](scratch/graphview-mockup-final.html). Stay on the queue order — the data dependencies (`enclosing_symbol_id`, framework, entry, layer) are the reason for the order.

### 3.1 Shipped + active

| Spec dir                                  | Design slice | State                        | Notes                                                                                                                                                                         |
| ----------------------------------------- | ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001-hello-symbol`                        | S1           | `done`                       | One-file parse → DuckDB → extension command                                                                                                                                   |
| `002-hello-tree-view`                     | S2           | `done`                       | Sidebar tree of files → symbols                                                                                                                                               |
| `003-hello-webview`                       | S3           | `done`                       | React webview, message bridge, symbol list                                                                                                                                    |
| `004-cicd-foundation-fixes`               | —            | `done`                       | Lint/typecheck/coverage scripts honest                                                                                                                                        |
| `005-cicd-github-actions`                 | —            | `done`                       | CI/CD wired                                                                                                                                                                   |
| `006-hello-graph` (intent)                | S4 (intent)  | superseded                   | Replaced by `010-hello-graph` after schema-alignment                                                                                                                          |
| `007-persistent-workspace-cache` (intent) | S5 (intent)  | superseded                   | Replaced by `011-persistent-workspace-cache`                                                                                                                                  |
| `008-hello-workspace` (intent)            | S6 (intent)  | superseded                   | Replaced by `012-hello-workspace`                                                                                                                                             |
| `009-align-schema-migrations`             | S3.5         | `done`                       | Migration runner; `Annotation` / `Module` / `Test` tables; `_schema_version` registry                                                                                         |
| `010-hello-graph`                         | S4           | `done`                       | `ExtractorRegistry`; pass-1 naive `CALLS`; Sigma webview render                                                                                                               |
| `011-persistent-workspace-cache`          | S5           | `done`                       | Cache identity, schema-versioned DB reuse across restarts                                                                                                                     |
| `012-hello-workspace`                     | S6           | `done`                       | Workspace-scale indexing, progress, PageRank node sizing                                                                                                                      |
| `013-auto-sync-watcher`                   | S6.5         | `done`                       | Debounced FS watcher + selective reparse                                                                                                                                      |
| `014-session-summary-export`              | S6.8         | `done` (final tasks pending) | User-pull session summary export                                                                                                                                              |
| `015-release-truth-gate`                  | S6.9         | `done` (final tasks pending) | Validation gate before releases                                                                                                                                               |
| `016-hello-mermaid`                       | S7           | `done`                       | Exporters package + `.mmd` serializer + Light/Dark/Print themes; merged via PR #56                                                                                            |
| `017-toolbar-consolidation`               | S7.1         | **`active`**                 | Spec authored + signed off; implementation has not started. Branch carries the spec + the security/docs commits from the 2026-05-24 session — split or bundle before merging. |

> Specs `006/007/008` exist as folders but their implementations were rewritten under `010/011/012` after the schema-alignment correction. They remain on disk for history.

### 3.2 Next-up queue (Phase 2 — reach the mockup)

These rows ARE the SpecKit handoff. Each has a stable spec-dir name reserved; when ready to author, run the `/speckit-specify` flow against the slice's Notes column. The mockup at [scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html) is the visual contract for every row.

| Spec dir                               | Design slice | State     | Spec when… | Notes (scope seed for `/speckit-specify`)                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------ | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `018-framework-detection`              | S7.2         | `next-up` | 017 ships  | Per-workspace + per-file framework detection (Phase 0a). Manifest parser (`package.json`, `pyproject.toml`, `go.mod`); framework registry; new `workspace_framework` table + `file.framework` / `file.framework_role` columns. Drives toolbar workspace chips + later S11.5 route map.                                                                                                                              |
| `019-node-edge-filters`                | S7.3         | `roadmap` | 018 ships  | Left rail Node Types (8 working types + Folder; Decorator/Import disabled). Right rail Edge Types (Defines, Imports, Calls, Extends, Contains-derived, Implements-stub). Rename `INHERITS` → `Extends` in UI.                                                                                                                                                                                                       |
| `020-inspector-panel`                  | S7.4         | `roadmap` | 019 ships  | Permanent right-rail Inspector. Signature + docstring + badges (importance, framework, layer, entry). Requires `getWorkspaceSubgraph` to project additional columns. **Drop `graphology-pagerank`; adopt `graphology-metrics`** (subsumes PR + adds centrality + modularity).                                                                                                                                       |
| `021-lenses-panel`                     | S7.4 (cont.) | `roadmap` | 020 ships  | God class / Most-used / Least-used / Entry points / Architecture lenses. Mutually exclusive. Dim non-matches. Uses `graphology-metrics` + `graphology-components` for orphan exclusion.                                                                                                                                                                                                                             |
| `022-search-and-focus-depth`           | S7.5         | `roadmap` | 021 ships  | Toolbar search box (matches symbol/file/fqn). Depth slider 1–6 hops. Camera flies to hits via `sigma.getCamera().animate()`. **Adopt `graphology-traversal.bfsFromNode`** — replace hand-rolled `computeDescendantSelection`.                                                                                                                                                                                       |
| `023-trace-route`                      | S7.6         | `roadmap` | 022 ships  | Toolbar Trace toggle. Two-click state machine (pick start, pick end). Banner at top of canvas. Dashed yellow path with off-path dimming. Inspector "Trace from here". **Adopt `graphology-shortest-path.bidirectional` + `edgePathFromNodePath`**.                                                                                                                                                                  |
| `024-workspace-switcher`               | S7.7         | `roadmap` | 023 ships  | Toolbar workspace name + popover. Workspaces page (multi-card view with framework chips + architecture-preview strip). New extension command `dextree.switchWorkspace`. Backed by existing `workspace_cache` table. New webview ↔ extension messages: `requestWorkspaceList`, `workspaceList`, `switchWorkspace`.                                                                                                   |
| `025-layout-presets`                   | S7.8         | `roadmap` | 024 ships  | Toolbar layout dropdown (ForceAtlas2 default / Circular / Hierarchical). **Adopt `graphology-layout.circular` + `graphology-dag.topologicalGenerations` + `graphology-layout-noverlap` anti-collision post-pass**.                                                                                                                                                                                                  |
| `026-entry-point-tagging-and-layer`    | S7.9         | `roadmap` | 025 ships  | Phase 0b: per-symbol entry-point classifier (runtime / handler / test / public-API → `symbol.entry_kind`) + architectural layer classifier (`symbol.arch_layer`). Square gold-bordered entry nodes via `@sigma/node-square` + `@sigma/node-border`.                                                                                                                                                                 |
| `027-mermaid-scoped-serializer`        | S7.10        | `roadmap` | 026 ships  | Discriminated-union refactor of [packages/exporters/src/mermaid/serializer.ts](packages/exporters/src/mermaid/serializer.ts). Scope + granularity + direction options. Fail-closed validator. **`graphology-operators.subgraph()` for scope extraction**. Still `.mmd` output.                                                                                                                                      |
| `028-enclosing-symbol-classdiagram`    | S7.11        | `roadmap` | 027 ships  | Phase 0c: `symbol.enclosing_symbol_id` column; populate during extraction. New `serializeToClassDiagram` (boxes + method-name stubs; labelled "v1 / preview"). Method-grouping via enclosing_symbol_id, not fqn parsing.                                                                                                                                                                                            |
| `029-mermaid-preview-panel`            | S7.12        | `roadmap` | 028 ships  | New webview tab. Inline picker (scope / granularity / diagram / direction). Rendered SVG. `.mmd` source pane. Format buttons (`.mmd`, `.svg`, `.png`, clipboard image, Markdown snippet). `mermaid` npm package loads in this webview only.                                                                                                                                                                         |
| `030-mermaid-context-menus-clicklinks` | S7.13        | `roadmap` | 029 ships  | Right-click symbol/file/folder → export with default scope + diagram type inferred from selection. `vscode://` `click` directives in exported diagrams; per-format default (off for `.mmd`, on for SVG/PNG/clipboard); gated by `dextree.exporters.includeClickLinks` setting. New commands: `dextree.exportCallers`, `exportCallees`, `exportClassHierarchy`, `exportPackage`, `exportTrace`, `exportCurrentView`. |
| `031-sequence-diagram-and-extractors`  | S7.14        | `roadmap` | 030 ships  | `serializeToSequenceDiagram` consuming 023 trace output — enables the previously-disabled picker entry. New `ImplementsExtractor` (class → interface edges, populates Inspector "Implements" group + classDiagram UML implements arrows). New `DecoratorExtractor` (populates `annotation` table, enables "Decorator" node-type filter).                                                                            |

After 031 ships, Phase 2 is complete and the mockup is realised in product. Phase 3 (legacy S8 LSP, S8.5 multi-language, S9 diagnostics, S10 git, S10.5 tests, S10.7 MCP, S11 blast radius, S11.5 route map, S11.7 PageRank/community overlay, S11.8 repo-map text snapshot) starts spec-by-spec in §7's order.

### 3.3 Active slice (most recent `active` row above)

| Field         | Value                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec dir      | `017-toolbar-consolidation`                                                                                                                                                                                                                                                        |
| Design slice  | `S7.1 — Toolbar consolidation`                                                                                                                                                                                                                                                     |
| Branch        | `017-toolbar-consolidation`                                                                                                                                                                                                                                                        |
| Primary proof | Single top toolbar replaces the floating edge-filter pills + minimap toggle + export button + scattered zoom controls. Minimap default OFF. `GraphToolbar` extracted as sub-component.                                                                                             |
| Done when     | Spec's task list all checked; `pnpm test` + `pnpm lint` + `pnpm typecheck` green; PR merged; mockup's top toolbar visibly matches.                                                                                                                                                 |
| **Caveat**    | Branch currently carries two out-of-scope commits from the 2026-05-24 session (`chore(docs): wall of honest + roadmap consolidation`, `fix(security): narrow workflow permissions`). Decide before merge: split into separate PRs (cleanest) or bundle in PR description (faster). |

### 3.4 Note to next SpecKit session

When you return to spec the next slice:

1. Read §3.2 top-to-bottom; find the topmost `next-up`. That's your target.
2. Open the corresponding row's `Notes` cell — that's your scope seed.
3. Check the open questions in §8 for any that block that slice's spec (the `(Phase 0a)` / `(UI)` / etc. tags map to slice categories).
4. Author `specs/<Spec dir>/spec.md` using `/speckit-specify`. Use the bundling discipline from §1 — **one primary surface, ≤400 LOC net**.
5. Update §3.1's table by adding a row + flipping the new slice to `active`; demote the previously-active slice to `done`.

If the slice you're about to spec doesn't appear in §3.2, **stop**. Either it's premature (a Phase 3+ slice that should wait), or §3.2 needs an update first.

---

## 4. Strategic resequencing

The original Phase 2 ordered LSP → multi-lang → diagnostics → git → tests → MCP → blast radius → route map → PageRank/community overlay → repo-map text snapshot. **That order is no longer right.** After S7 lands, the immediate goal is **reaching the final-state mockup** ([scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html)) — because the mockup represents the user-visible product moat, and the underlying graph contract is now stable enough to dress it up.

The resequencing principle:

1. **Mockup-completion work jumps the queue.** Toolbar consolidation, filters, lenses, search, depth, trace mode, workspace switcher, layout presets, entry-point styling, and Mermaid v2 (preview panel + classDiagram + sequenceDiagram) become Phase 2.
2. **Index-time enrichment is woven in.** Framework detection, entry-point tagging, architectural layer classification, and `enclosing_symbol_id` are prerequisites to several mockup features — they ship as Phase 2 sub-slices, not as a separate phase, and each one lands just before the UI slice that consumes it.
3. **Original Phase 2 moat features move to Phase 3.** LSP, multi-language pass-1, diagnostics, git, tests, MCP, blast radius, route map, repo-map text snapshot, PageRank/community overlay — they still ship, but **after** the mockup. PageRank value is already partially delivered via S6's node sizing; the dedicated PageRank slice now focuses on the community overlay + ranking persistence.
4. **Exports / Alfred / federation stay in their original later phases.**

This is the change v2 ratifies. The rest of the doc reflects the new order.

---

## 5. Library audit — what we use vs what we adopt

The sigma.js + graphology ecosystems already contain most of what the mockup needs. **Reusing library primitives is the largest single source of code reduction in Phase 2.**

### Currently installed

`sigma`, `graphology` (`MultiDirectedGraph`, `DirectedGraph`), `graphology-layout-forceatlas2`, `graphology-pagerank`, `graphology-types`, `graphology-utils` (transitive).

### graphology packages to adopt (per slice)

| Package                                  | What it gives                                                                                                  | Used by slice                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `graphology-shortest-path`               | `bidirectional` (unweighted), `dijkstra.bidirectional` (weighted), `edgePathFromNodePath`                      | Trace route (S7.6)                                                                  |
| `graphology-traversal`                   | `bfs`, `bfsFromNode` with depth in callback; return `true` to prune                                            | Focus depth slider (S7.5)                                                           |
| `graphology-communities-louvain`         | Louvain communities; `assign` writes `community` attr; `detailed()` exposes modularity                         | Architecture lens (S7.4); later S11.7 community overlay                             |
| `graphology-metrics`                     | density, modularity, centrality (betweenness/closeness/degree/eigenvector), HITS, **PageRank**, layout-quality | All lenses (S7.4); replaces `graphology-pagerank`                                   |
| `graphology-operators`                   | `subgraph(graph, nodeSet)`, `reverse`, `union`, casting                                                        | Mermaid scoped export (S7.10)                                                       |
| `graphology-components`                  | `connectedComponents`, `largestConnectedComponent`, `cropToLargestConnectedComponent`                          | Least-used lens (S7.4) — exclude orphans cleanly                                    |
| `graphology-dag`                         | `topologicalSort`, `topologicalGenerations`, `hasCycle`                                                        | Hierarchical layout preset (S7.8)                                                   |
| `graphology-layout`                      | `circular`, `random`, `circlepack`                                                                             | Layout presets (S7.8) — circular                                                    |
| `graphology-layout-noverlap`             | Iterative anti-collision post-pass on `x,y`                                                                    | All layouts → hulls look better (S7.8)                                              |
| `graphology-svg`                         | Server-side SVG export, pure JS                                                                                | Future CLI SVG export — defer                                                       |
| `graphology-canvas`                      | Canvas + `renderToPNG` (needs `node-canvas` in Node)                                                           | Future CLI PNG export — native dep, banned in `core`, fine in `cli` package — defer |
| `graphology-simple-path`                 | `allSimplePaths` with cutoff                                                                                   | Trace v2: "show 3 paths between A and B" — defer to S7.6 follow-up                  |
| `graphology-gexf` / `graphology-graphml` | Gephi / GraphML import-export                                                                                  | **Skip.** Mermaid is the export contract.                                           |

### Sigma.js capabilities to lean on harder

| API                                                                                       | What it gives                                | Slices                                                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `sigma.getCamera().animate(state, opts)` + `animatedReset()` / `animatedZoom()`           | Smooth tweens                                | Fly-to-search (S7.5), fit-to-view, reset                                               |
| `sigma.viewportToGraph()` / `sigma.graphToViewport()` / `sigma.getNodeDisplayData(id)`    | Coord conversion for overlays                | Trace overlay drawing (S7.6), cluster hulls                                            |
| `nodeReducer` / `edgeReducer`                                                             | Per-frame display object — no graph mutation | Click-to-isolate, lens dimming, search highlight, trace dimming (already used, expand) |
| Events: `clickNode`, `enterNode`, `doubleClickNode`, `clickStage`, `wheel`, `afterRender` | Interaction + render-lifecycle hooks         | All interactions; `afterRender` for canvas overlays                                    |
| `labelRenderedSizeThreshold`, `labelGridCellSize`                                         | Built-in label management at zoom            | Search results, hierarchical layout                                                    |

### Sigma official add-on packages

| Package                                     | Purpose                                             | Slice                                                                                |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@sigma/node-square` + `@sigma/node-border` | Entry-point styling: `type: 'square'` + gold border | S7.9 entry-point styling — **drops to ~1 day** vs writing a custom node program      |
| `@sigma/edge-curve`                         | Reduces overlap on parallel edges                   | Future polish — defer                                                                |
| `@sigma/layer-webgl`                        | Helper to draw your own WebGL layer                 | Reconsider for cluster hulls only if current canvas implementation degrades at scale |

### No off-the-shelf option (keep building)

- **Minimap** — no official Sigma minimap plugin. Keep custom canvas implementation. Default OFF per mockup.
- **Cluster hulls** — current canvas implementation works. Rewrite to `@sigma/layer-webgl` only if performance degrades.

### Library churn summary

| Action | Package(s)                                                                                                                                                                                                                                                                   | When                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Add    | `graphology-shortest-path`, `graphology-traversal`, `graphology-communities-louvain`, `graphology-metrics`, `graphology-operators`, `graphology-components`, `graphology-dag`, `graphology-layout`, `graphology-layout-noverlap`, `@sigma/node-square`, `@sigma/node-border` | Per the slices below |
| Remove | `graphology-pagerank` (subsumed by `graphology-metrics`)                                                                                                                                                                                                                     | S7.4 lenses          |
| Keep   | `sigma`, `graphology`, `graphology-layout-forceatlas2`, `graphology-types`, `graphology-utils`                                                                                                                                                                               | —                    |

---

## 6. Mermaid export — supported diagram types

After a per-type data audit ([scratch/mermaid-diagram-types-audit.md](scratch/mermaid-diagram-types-audit.md)), Dextree supports **three** Mermaid diagram types. The picker shows only these three; unsupported are tooltipped with the reason.

| Type                       | When available                                | Slice                                                                                     |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `flowchart` (LR / TD / TB) | Always — works on any non-empty subgraph      | S7 (baseline shipping now) + S7.10 (scoped, capped)                                       |
| `classDiagram` v1          | Scope contains ≥1 class / interface / enum    | S7.11 (boxes + method-name stubs, no signatures yet — labelled "v1 / preview")            |
| `classDiagram` v2          | After signature + visibility extraction lands | Future enhancement, not yet sliced                                                        |
| `sequenceDiagram`          | Scope is a trace route                        | Picker shows **disabled with reason** until S7.6 (trace route) ships; serializer in S7.14 |

The serializer becomes a **discriminated union — one function per diagram type** (S7.10 refactor). Each type has a **fail-closed validator**: refuses to render if scope exceeds the cap, with one-click suggestions to coarsen.

### Caps

| Diagram           | Soft cap (warn)       | Hard cap (refuse)     |
| ----------------- | --------------------- | --------------------- |
| `flowchart`       | 100 nodes / 200 edges | 150 nodes / 300 edges |
| `classDiagram`    | 60 nodes              | 100 nodes             |
| `sequenceDiagram` | 40 steps              | 80 steps              |

### Picker behaviour

- Lives inside the preview panel (not a modal) — changing diagram type re-renders inline.
- Granularity options filtered by diagram type (`classDiagram` requires `Class`; `sequenceDiagram` requires `Symbol`).
- Direction auto-inferred from scope; override in Advanced.
- Scope expansion via `graphology-operators.subgraph()` against the focused node set.

### Output formats

`.mmd`, `.svg` (via `mermaid.render()`), `.png` (SVG → canvas → toBlob), clipboard image, Markdown snippet, `.html` (standalone). PDF deferred.

### Mermaid features exploited

- **Clickable nodes** — `click NodeId "vscode://file/<path>:<line>"`; per-format default (off for `.mmd` committed to repos, on for SVG/PNG/clipboard).
- **`classDiagram` UML edges** — `<|--` extends, `<|..` implements, `*--` composition.
- **`sequenceDiagram` from trace** — actor per enclosing class via `enclosing_symbol_id`.

---

## 7. Release roadmap

### Phase 0 — Baseline integrity ✅

**Goal:** the repo is trustworthy enough that later slice validation means something.

Slices: `003`, `004`, `005`. **All done.** Exit gate cleared: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and packaging are green.

### Phase 1 — v0.1 truthful local graph loop (mostly done)

**Definition:** a developer can index a real local workspace in VS Code, reopen it from cache, edit files, and see the graph remain truthful and responsive.

| Slice                                                   | Status                            |
| ------------------------------------------------------- | --------------------------------- |
| `S3.5` (009) — Schema alignment + migration scaffolding | ✅ done                           |
| `S4` (010) — Hello Graph                                | ✅ done                           |
| `S5` (011) — Persistent Workspace Cache                 | ✅ done                           |
| `S6` (012) — Hello Workspace                            | ✅ done                           |
| `S6.5` (013) — Auto-sync watcher                        | ✅ done                           |
| `S6.8` (014) — Session summary export                   | ✅ done (final tasks)             |
| `S6.9` (015) — Release-truth gate                       | ✅ done (final tasks)             |
| **`S7` (016) — Hello Mermaid**                          | **🟡 active** — baseline shipping |

**Exit gate (mostly met):**

- Pass 1 writes the graph the UI visualizes ✅
- `CALLS` is real naive pass-1 data ✅
- Unchanged file save is a no-op for parse + DB write ✅
- Workspace reopen from cache is safe and obvious ✅
- Runtime doctor flow for DuckDB / WASM — partial (S6.9 covers release gating)
- README / extension metadata match shipped commands ✅
- `S7` baseline Mermaid export — finalising

### Phase 2 — v0.2 reach the mockup (NEW SEQUENCE)

**Definition:** Dextree's GraphView matches [scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html). Toolbar consolidated, filters/lenses functional, search + depth + trace + workspace switcher live, layout presets, entry-point styling, and Mermaid v2 (scoped + classDiagram + preview panel) all shipped.

The mockup IS the spec. Each slice's success = "this part of the mockup now works."

**Required slices (in execution order):**

#### S7.1 — Toolbar consolidation

Move existing controls (Export, minimap toggle, edge-filter pills) into a unified top toolbar. Minimap default **OFF**. First user-visible win post-S7.

- Decompose [packages/extension/src/webview/components/GraphView.tsx](packages/extension/src/webview/components/GraphView.tsx) (~1700 LOC) — extract `GraphToolbar` sub-component
- Mockup delta: toolbar shell live; minimap toggleable but hidden by default

#### S7.2 — Phase 0a: Framework detection (index-time)

Per-workspace + per-file framework detection. Required input for S7.4 framework chip + S7.9 entry-point styling.

- Manifest parser (`package.json` deps, `pyproject.toml`, `go.mod`, etc.)
- Framework registry — require BOTH manifest marker AND structural signal (e.g. `app.get(` for Express, `vscode.commands.registerCommand` for VS Code extensions)
- New `workspace_framework` table; new `file.framework`, `file.framework_role` columns
- Mockup delta: workspace switcher shows framework chips; status bar `vscode-ext` pill

**Cross-reference:** legacy S11.5 (Framework route map) is a **richer** version of this work — runtime route extraction with `ApiEndpoint` extension nodes. S7.2 is the detection layer; S11.5 (deferred to Phase 3) adds the route map on top.

#### S7.3 — Node-type + edge-type filters

Left rail filter list (Folder + File + 7 symbol kinds; Decorator + Import disabled rows). Right rail Edge Types section (Defines, Imports, Calls, Extends, Contains-derived, Implements-stub). Rename `INHERITS` → `Extends` in UI.

- Mockup delta: left + right rails functional; legend chips show edge colours

#### S7.4 — Inspector panel + lenses

Permanent right-rail Inspector with signature + docstring + badges (importance, framework, layer, entry). Lenses panel: God class / Most-used / Least-used / Entry points / Architecture.

- Project additional columns from `getWorkspaceSubgraph` (`fan_in`, `flags`, `is_core`, `signature`, `docstring`)
- **Library change:** drop `graphology-pagerank`, adopt `graphology-metrics` (subsumes PageRank + adds centrality + modularity)
- Lenses use `graphology-metrics` (PageRank, fan-in) + `graphology-components` (orphan exclusion for Least-used)
- Mockup delta: Inspector + Lenses panels live; status-bar active-lens pill

#### S7.5 — Search + focus depth slider

Toolbar search box (matches by label / fqn). Depth slider (1–6 hops). Camera flies to search hits via `sigma.getCamera().animate()`.

- **Library change:** adopt `graphology-traversal.bfsFromNode` with max-depth pruning; replaces hand-rolled `computeDescendantSelection`
- Mockup delta: search returns results, depth changes BFS hop count

#### S7.6 — Trace route mode

Toolbar Trace toggle. Two-click state machine: pick start, pick end. Banner at top of canvas. Dashed yellow path with off-path dimming. Inspector "Trace from here" shortcut.

- **Library change:** adopt `graphology-shortest-path.bidirectional` + `edgePathFromNodePath`
- Mockup delta: trace scene from mockup is functional end-to-end

#### S7.7 — Workspace switcher

Toolbar workspace name + popover. Workspaces page (multi-card view with framework chips + architecture-preview strip). `dextree.switchWorkspace` command.

- Backed by existing `workspace_cache` table
- New webview ↔ extension messages: `requestWorkspaceList`, `workspaceList`, `switchWorkspace`
- Mockup delta: workspaces scene from mockup is functional; switching re-opens the GraphView with a different indexed workspace

#### S7.8 — Layout presets

Toolbar layout dropdown: ForceAtlas2 (default) / Circular / Hierarchical.

- **Library change:** adopt `graphology-layout.circular` + `graphology-dag.topologicalGenerations` (for hierarchical) + `graphology-layout-noverlap` (anti-collision post-pass)
- Mockup delta: layout dropdown works; users can switch presets

#### S7.9 — Phase 0b: Entry-point tagging + architectural layer (index-time)

Index-time classification. Required input for S7.4 layer badges + Architecture lens + S7.9 entry-point node styling.

- **Entry-point tagging** — four kinds: runtime entry (`main`, `activate`), registered handler (Express route, VS Code command), test entry (`describe`/`it`, pytest), public API. New `symbol.entry_kind` + `symbol.entry_metadata` JSON columns.
- **Architectural layer classification** — entry → orchestration → domain → I/O → utility → dead. Heuristic classifier. New `symbol.arch_layer` column.
- **Entry-point styling** — square + gold border via `@sigma/node-square` + `@sigma/node-border`. (~1 day vs writing a custom node program.)
- Mockup delta: Entry-points lens shows real data; entry nodes render as gold-bordered squares; layer badges populated in Inspector

**Cross-reference:** legacy S11.5 (Framework route map) and S11.7 (PageRank + community overlay) build on this enrichment in Phase 3.

#### S7.10 — Scoped flowchart serializer + caps

Discriminated-union refactor of [packages/exporters/src/mermaid/serializer.ts](packages/exporters/src/mermaid/serializer.ts). Scope + granularity + direction options. Fail-closed validator.

- **Library change:** adopt `graphology-operators.subgraph()` for scope extraction
- New `packages/exporters/src/mermaid/scope.ts` — pure BFS / path-walk, enforces caps
- Still `.mmd` output. No new UI.
- Mockup delta: the `flowchart` part of the Mermaid preview-panel mockup is render-ready

#### S7.11 — `enclosing_symbol_id` column + classDiagram v1

Phase 0c: add `symbol.enclosing_symbol_id` column; populate during extraction so class methods point at their class.

- Unlocks reliable class-grouping for Mermaid `classDiagram` without fqn parsing
- New `serializeToClassDiagram` (boxes + method-name stubs; labelled "v1 / preview")
- Mockup delta: `classDiagram` option in the Mermaid picker; method-grouping works

#### S7.12 — Mermaid preview-and-export panel

New webview tab. Inline picker (scope / granularity / diagram / direction). Rendered SVG. `.mmd` source pane. Format buttons (`.mmd`, `.svg`, `.png`, clipboard image, Markdown snippet).

- `mermaid` npm package only loads in this webview, not in `core`
- New webview: `packages/extension/src/webview/MermaidPreview/`
- Mockup delta: the Mermaid preview scene from the mockup is functional

#### S7.13 — Context menu commands + clickable export

Right-click symbol / file / folder → export with default scope + diagram type inferred from selection. `vscode://` `click` directives in exported diagrams; gated by `dextree.exporters.includeClickLinks` setting.

- New commands: `dextree.exportCallers`, `exportCallees`, `exportClassHierarchy`, `exportPackage`, `exportTrace`, `exportCurrentView`
- New `packages/exporters/src/mermaid/clickLinks.ts` — pure

#### S7.14 — `sequenceDiagram` from trace + `IMPLEMENTS` extractor + Decorator extractor

Closes the remaining mockup stubs.

- `serializeToSequenceDiagram` consuming S7.6 trace output — enables the previously-disabled picker entry
- `ImplementsExtractor` — class-to-interface relationships; populates Inspector "Implements" group + `classDiagram` UML implements arrows
- `DecoratorExtractor` — populates `annotation` table; enables "Decorator" node-type filter

**Phase 2 exit gate:**

- The final-state mockup ([scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html)) is realised in product, all four scenes (GraphView, Mermaid preview, Trace mode, Workspaces) functional
- Phase 0 enrichment (framework / entry / layer / enclosing_symbol_id) populates on every reindex
- Mermaid v2 (scoped + classDiagram + sequenceDiagram + preview panel + click links) ships
- README + marketplace metadata reflect the new commands + settings

---

### Phase 3 — v0.3 moat overlays (resequenced from old Phase 2)

**Definition:** Dextree stops being "graph in VS Code" and starts shipping signals headless/browser competitors do not naturally own. The mockup is already real; these slices add semantic depth and external surfaces.

**Required slices:**

#### S8 — Hello LSP

Pass-2 semantic enrichment without breaking pass-1 usefulness.

- LSP adapter; upgrade-in-place logic for resolved edges; UI refresh for enriched nodes
- Pass-1 graph appears immediately; resolved semantic edges upgrade live

#### S8.5 — Multi-language pass-1

Extend pass-1 beyond TypeScript to TS/JS/Python/Go/Rust via the `ExtractorRegistry`. Closes the 1-vs-N-languages competitive gap.

- Per-language `Extractor` registrants
- Bundle tree-sitter WASM grammars under `packages/extension/resources/`
- Per-language `call_expression` heuristics for naive `CALLS`

#### S9 — Hello Diagnostics

Fuse VS Code diagnostics into the graph. Symbols with errors/warnings visible and queryable.

#### S10 — Hello Git

Git-derived recency and authorship signals. Graph nodes can be colored or filtered by git recency.

#### S10.5 — Hello Tests

Link tests to symbols-under-test via framework heuristics (jest/vitest/pytest); populate `TESTED_BY` edges. Closes the test-linkage moat gap.

- Relies on S3.5 schema alignment (Test entity table)
- Coverage overlay possible once edges exist

#### S10.7 — MCP server (read-only)

Expose the v0.2 graph to external agents over MCP. Same SQL/PGQ query layer the webview consumes.

- New `packages/mcp/`; `@modelcontextprotocol/sdk`
- MCP tools wrap existing `query/*` exports
- No write surface yet — write tools land in Phase 4 (E2)

#### S11 — Hello Blast Radius

Combine git diff + reverse graph traversal into Dextree's first killer feature.

- Changed-line-to-symbol mapping; reverse traversal; scoring; core-file warnings; blast-radius panel
- Compare against `main`, show changed symbols, affected neighbors, score, and core-file hits

#### S11.5 — Framework route map (extension of S7.2 detection)

Builds on S7.2 framework detection. Detect framework-driven HTTP routes (Express, NestJS, FastAPI, Flask, Spring); materialize `ApiEndpoint` extension nodes.

- Per-framework extractors registered against the §8.6 plugin contract
- `ApiEndpoint` writes; `ROUTES_TO` edges
- **UI:** process / execution-flow panel — left-side panel grouping detected routes by community

#### S11.7 — PageRank persistence + community overlay (extension of S7.4 lenses)

Builds on S7.4 lenses (which already use `graphology-metrics` PageRank in-memory). Now persist to `symbol.pagerank` column for blast-radius scoring + Alfred top-K selection.

- Same recompute pass also computes Louvain communities via `graphology-communities-louvain`
- Writes `community_id` column on `symbol`
- **UI:** community overlay — nodes colored by community; soft convex hulls behind clusters; `C` toggles hull visibility

#### S11.8 — Repo-map text snapshot

Token-budgeted text snapshot built from PageRank top-K per file. Default 1024 tokens. Non-LLM text snapshot for Cmd-F / copy-paste; also the default system prompt every Alfred prompt consumes.

**Phase 3 exit gate:**

- Pass-1 stays useful before pass-2 resolves
- MCP answers match the same graph/query model the UI uses
- At least one moat overlay (blast radius / route map / community overlay) is visibly compelling in-product

---

### Phase 4 — v0.4 surface expansion

**Definition:** add outward-facing surfaces only after the shared graph contract and moat query model are dependable.

**Required slices:**

- `E1a` — SCIP exporter. Ships **first** in this phase. `sourcegraph/scip` is the de-facto interop format; zero competitors emit it. Unlocks `src` CLI + Sourcegraph Cloud as distribution channels.
- `E1b` — Canvas exporter
- `E1c` — PNG / PDF / SVG via `pdf-lib`
- `E2` — MCP write tools + auto-config installer (extends S10.7 read-only MCP)
- `E3` — Settings UI webview
- `S7.5` — PGQ / SQL query console — only if DuckPGQ feasibility is proven on Mac / Linux / Windows against `@duckdb/node-api`. Falls back to SQL-only if PGQ fails on a target.

**Phase 4 exit gate:**

- SCIP ships before prettier export work dominates attention
- Export theming uses one semantic token system
- Settings UI exists because there are enough real settings to justify it

---

### Phase 5 — v0.5 Alfred and lightweight federation

**Definition:** Alfred arrives only after the graph is already useful on its own, and multi-repo value appears in a lighter form before full federation.

**Required slices:**

- `S12` — Hello Alfred (one prompt over graph data; explicit opt-in; preview-first)
- `S13` — Built-in prompt library
- `S13.5` — Repo groups (read-only federation)

**Phase 5 exit gate:**

- Alfred consumes repo-map and graph primitives that already exist
- Prompt execution stays opt-in, BYOK, and preview-first
- Repo-group mode proves whether users need more than scoped read-only federation

---

### Phase 6 — Later expansion

#### v0.6

- `V1` — Vector search / local embeddings. Only spec this after graph traversal limits are clear from real use. The `embedding FLOAT[1536]` slot is already declared in schema.
- `V2` — Vite embeddable component. Only spec this after the extension graph and export contract have stabilised.

#### v0.7

- `S14` — Workspace federation (merged multi-repo graph, globally addressable symbol IDs)

---

## 8. Recommended working order

This is the practical queue. **Anything below row 4 stays at roadmap level until the active slice above it is nearly merged.**

| Priority | Slice                              | State     | Why now                                                 |
| -------- | ---------------------------------- | --------- | ------------------------------------------------------- |
| 1        | `016-hello-mermaid` (S7)           | `active`  | Finish the Phase 1 exit gate                            |
| 2        | `017-toolbar-consolidation` (S7.1) | `next-up` | First mockup-visible win post-S7; small, low-risk       |
| 3        | `018-framework-detection` (S7.2)   | roadmap   | Phase 0a enrichment — feeds S7.4                        |
| 4        | `019-node-edge-filters` (S7.3)     | roadmap   | Left + right rails functional                           |
| 5+       | S7.4 → S7.14                       | roadmap   | In sequence above; each gets its own spec when promoted |

After S7.14 (Phase 2 exit), promote S8 (Hello LSP) as the first Phase 3 slice.

---

## 9. Open questions (block specific slices)

Numbered globally so slice specs can reference them by stable Q-number.

1. _(UI)_ Lens behaviour — dim or hide non-matches? _Tentative: dim._
2. _(UI)_ Trace route — shortest path or all paths? _Tentative: shortest first; "Show all paths" via `graphology-simple-path.allSimplePaths` as S7.6 follow-up._
3. _(UI)_ Lens mutual exclusivity? Can lenses stack with node-type filters? _Tentative: one lens; filters compose on top._
4. _(UI)_ Right rail width — fixed 280px or resizable splitter?
5. _(UI)_ Inspector empty state — Top-10 leaderboard, empty hint, or hidden?
6. _(UI)_ Toolbar density at narrow widths — hide labels, keep icons?
7. _(UI)_ Workspace switcher source — `workspace_cache` only, or also include "recently opened in VS Code"? _Tentative: `workspace_cache` only._
8. _(UI)_ Legend placement — floating canvas panel (current mockup) or part of Edge Types rail header? _Tentative: keep floating._
9. _(Data model)_ "Import" as a node type — drop or model as synthetic symbols? _Tentative: drop; imports stay as edges._
10. _(Data model)_ `Contains` edge — stored or derived? _Tentative: derive client-side (storing would skew PageRank)._
11. _(Phase 0a)_ Framework detector — extensible registry or hardcoded?
12. _(Phase 0a)_ Entry-point patterns — bundled or user-configurable for custom routers?
13. _(Phase 0b)_ Layer classifier — heuristics only, or trainable later (the `embedding` slot exists)?
14. _(Phase 0b)_ Re-classification cost on incremental updates — whole workspace, or just touched symbols + first-degree neighbors?
15. _(Phase 0b)_ Display priority when signals conflict (a symbol is top-10 PageRank AND a registered handler AND dead by `fan_in`) — which lens wins?
16. _(Phase 0c)_ `enclosing_symbol_id` for nested functions / closures — point at directly enclosing function, or skip to nearest named scope? _Tentative: directly enclosing._
17. _(Mermaid)_ Picker behaviour when no scope is meaningful (no selection, no lens, no trace) — empty state asking for scope, or default to "whole workspace at Folder granularity"? _Tentative: empty state._
18. _(Phase 3)_ H5 — does DuckPGQ work on Mac + Linux + Windows against `@duckdb/node-api@1.5.2-r.1`? Blocks `S7.5` PGQ query console.

---

## 10. Decisions captured (do not re-litigate)

### Architecture

- The mockup ([scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html)) IS the spec for Phase 2. Every Phase 2 slice maps to a visible delta in the mockup.
- Phase 0 enrichment (framework / entry / layer / enclosing_symbol_id) is woven into Phase 2, not a separate phase — each enrichment lands just before the UI slice that consumes it.
- `GraphView.tsx` is **decomposed**, not rewritten. Sub-components extracted slice by slice.
- Phase 2 jumps the queue ahead of the legacy Phase 2 backlog (LSP / multi-lang / diagnostics / git / tests / MCP / blast radius / route map / repo-map). Those move to Phase 3.

### Libraries

- Drop `graphology-pagerank`; adopt `graphology-metrics` (subsumes PageRank + adds centrality + modularity + layout-quality).
- Adopt `graphology-shortest-path`, `graphology-traversal`, `graphology-operators`, `graphology-components`, `graphology-dag`, `graphology-layout`, `graphology-layout-noverlap`, `graphology-communities-louvain` per the slices that need them.
- Adopt `@sigma/node-square` + `@sigma/node-border` for entry-point styling (S7.9 — ~1 day, not weeks).
- Keep custom canvas implementation for minimap and cluster hulls (no Sigma plugin for minimap; cluster hulls already work).

### Mermaid

- Supported types: `flowchart`, `classDiagram` (v1 → v2), `sequenceDiagram`. All others dropped (`erDiagram`, `stateDiagram`, `mindmap`, `block-beta` not worth the surface area).
- `classDiagram` ships v1 (boxes + method-name stubs), labelled "v1 / preview." v2 (UML signatures + visibility) when extractor enrichment lands.
- Method grouping in `classDiagram` uses `enclosing_symbol_id` (S7.11), not fqn parsing.
- Picker placement: inline in the preview panel, not a modal.
- `sequenceDiagram` before trace-route lands — shown as **disabled with explanation**, not hidden.
- `flowchart` direction auto-inferred from scope (LR for calls, TD for hierarchies, TB for imports); override in Advanced.
- PNG rendering: canvas-in-webview only. No Puppeteer.
- `.mmd` round-trip: not supported (source of truth is the index).
- Click-links: per-format default — off for `.mmd`, on for SVG/PNG/clipboard.
- Cap policy: soft cap with warning + hard cap with refusal. No best-effort render.
- No silent whole-graph export. Whole-workspace exports must specify a granularity coarse enough to fit under the cap.

### UI defaults

- Minimap default OFF (S7.1).
- Folder granularity synthesised client-side from file paths — not stored.
- `INHERITS` renamed to `Extends` in the UI (DB kind stays `INHERITS`).
- Legend stays as a floating canvas panel (mockup decision).

### Sequencing

- After S7 lands, the immediate goal is **reaching the mockup**, not the legacy Phase 2 backlog. PageRank / community overlay / blast radius / route map all still ship, but in Phase 3.
- PageRank value is already partially delivered via S6 node sizing. The dedicated PageRank slice (S11.7) now focuses on persistence + community overlay, not the basic ranking.

---

## 11. Promotion gates

### Definition of Ready (slice can leave roadmap level)

- Slice has one primary proof point
- Owning package(s) explicit
- Primary surface explicit
- Independent validation known
- Does not mix multiple new surfaces or multiple major architecture decisions
- Pass 1 vs pass 2 expectations explicit if indexing is involved
- Privacy and opt-in boundaries explicit if Alfred or remote calls are involved

### Definition of Done

- Spec, plan, and tasks committed
- Code, tests, and validation complete
- Independent proof demonstrated
- Draft PR passed review and merged
- README, changelog, or marketplace docs updated if user-facing
- This roadmap updated with any scope, ordering, or dependency changes learned from the slice

---

## 12. Near-term plan

Concrete next moves:

1. **Finish S7 (016-hello-mermaid).** Close out the remaining tasks in [specs/016-hello-mermaid/tasks.md](specs/016-hello-mermaid/tasks.md); land the PR.
2. **Answer open questions 1–6** (UI design — block specs for S7.1 through S7.4).
3. **Spec S7.1 — Toolbar consolidation.** Smallest first mockup win.
4. **Spec S7.2 — Framework detection** in parallel (it's a core slice, doesn't conflict with the webview work of S7.1).
5. **Answer open questions 11–12** (framework detector design) before S7.2 spec finalises.

After S7.1 + S7.2 land, promote S7.3 → S7.14 in sequence.

Per [CLAUDE.md](CLAUDE.md), implementation begins only after a slice's `spec.md` → `plan.md` → `tasks.md` chain is approved.

---

## 13. What was deleted / superseded by this doc

- **Original draft `ROADMAP.md`** at repo root — content absorbed into this file; deleted.
- **`scratch/ROADMAP.md`** — all 22 GraphView slices folded into Phase 2 (as S7.1–S7.14) and Phase 3 cross-references; deleted.
- `scratch/graphview-redesign-findings.md` and the original `scratch/graphview-roadmap.md` — archived (deleted) in an earlier consolidation pass.
- This file was previously named `ROADMAP-v2.md`; renamed to `ROADMAP.md` once it became the only roadmap.

The companion reference docs ([scratch/graphview-mockup-final.html](scratch/graphview-mockup-final.html), [scratch/graphview-db-relations.md](scratch/graphview-db-relations.md), [scratch/mermaid-diagram-types-audit.md](scratch/mermaid-diagram-types-audit.md), [RESEARCH-SCRATCH.md](RESEARCH-SCRATCH.md)) are **reference material**, not roadmaps — they're authored once and consulted by spec writers. They are not superseded.
