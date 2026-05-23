# Dextree Research Scratch — 2026-05-22

## 0. Executive Summary

1. Treat **S3.5 schema alignment** as a release blocker, not roadmap garnish. The live storage layer still lacks `Annotation`, `Module`, and `Test`, has no migration runner, no `_schema_version` registry table, no DuckPGQ/`vss`/`fts` plumbing, and no extractor plugin contract (`packages/core/src/storage/schema.ts:5-156`, `packages/core/src/parser/extractor.ts:17-319`).
2. Stop advertising features the codebase does not ship. `README.md` still promises blast radius, Alfred, exporters, DuckPGQ-backed queries, and extra packages that do not exist in `packages/` today (`README.md:9-25`, `README.md:60-68`, `README.md:131-139`; actual `packages/` is just `core/` and `extension/`).
3. Make **truthful incremental indexing** a v0.1 gate. `indexWorkspace` still clears the whole workspace before every run, and `indexFile` always reparses and rewrites even though `file.hash` is already persisted (`packages/extension/src/commands/indexWorkspace.ts:92-145`, `packages/core/src/index.ts:77-118`).
4. Keep the roadmap moves that are already correct: **MCP in v0.2**, **SCIP before Canvas/PDF**, **RepoMap/PageRank in v0.2**. But also add a **repo-map text snapshot** before Alfred so the LLM layer has a credible substrate.
5. Do **not** drag full merged multi-repo graphing into v0.1-v0.2. Do add an earlier, lighter **repo-group / federated read-only** slice before the current v0.6 merged-graph plan.

## 1. Codebase Audit

### 1.1 Reality snapshot

| Check                    | Verdict                          | Evidence                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package layout vs design | **Drifted hard**                 | Design/rules assume `core`, `extension`, `mcp`, `cli`, `web`, `exporters`, `alfred`; repo has only `packages/core` and `packages/extension` (`packages/`).                                                                                        |
| Validation baseline      | **Mixed**                        | `pnpm lint` passes, `pnpm test` passes, `pnpm typecheck` fails on `graphology-pagerank` declaration visibility from the extension build boundary (`packages/core/src/query/pagerank.ts:2`, `packages/core/src/types/graphology-pagerank.d.ts:1`). |
| Layer leakage            | **Pass**                         | No `vscode` imports found under `packages/core`; `packages/alfred` does not exist.                                                                                                                                                                |
| Privacy boundary         | **Pass by absence**              | No HTTP client, telemetry, or SecretStorage usage under `packages/`; Alfred is still docs-only.                                                                                                                                                   |
| Error isolation          | **Mostly good**                  | Per-file workspace indexing catches and logs failures and continues (`packages/extension/src/commands/indexWorkspace.ts:128-145`). Startup graph refresh still swallows failures silently (`packages/extension/src/extension.ts:121-132`).        |
| Hot-symbol tests         | **No obvious zero-test hotspot** | Conservative fan-in scan did not surface a runtime symbol with fan-in `>= 5` that also lacked both direct test references and a nearby test file.                                                                                                 |

### 1.2 Mandatory checks, one by one

| Check                           | Result                            | Notes                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Layer leakage                | **No live violation**             | `packages/core` is clean; `packages/alfred` is absent, so there are no current violations to list.                                                                                                                                                                                                                                                |
| 2. Schema vs storage drift      | **Fail**                          | Live schema only has `file`, `symbol`, `edge`, `call_site`, `import_ref`, `diagnostic`, `workspace_cache`; design-core entities `Annotation`, `Module`, `Test` are missing, as are migration scaffolding and schema registry (`packages/core/src/storage/schema.ts:5-156`).                                                                       |
| 3. Extractor plugin contract    | **Fail**                          | No `ExtractorRegistry`, no `Extractor` interface, and extraction is hardcoded around a file-extension map plus TypeScript/plain-file branching (`packages/core/src/parser/extractor.ts:17-319`, `packages/core/src/index.ts:87-93`).                                                                                                              |
| 4. Two-pass discipline          | **Fail**                          | There is no pass 2 implementation, no `naive -> resolved` upgrade path, and runtime code never writes `CALLS`; the query layer reads `call_site` anyway and the UI advertises `CALLS` edges (`packages/core/src/storage/repository.ts:207-303`, `packages/core/src/query/subgraph.ts:101-174`, `packages/extension/src/webview/App.tsx:194-207`). |
| 5. Privacy boundaries           | **Pass by absence**               | No runtime HTTP or telemetry code exists under `packages/`; Alfred/LLM settings and SecretStorage flows are not implemented yet.                                                                                                                                                                                                                  |
| 6. Native dependency risk       | **High risk**                     | `@duckdb/node-api` is mandatory at runtime with no fallback (`packages/core/src/storage/db.ts:9-22`); tree-sitter runtime expects packaged WASM assets in `dist/` with no degrade path (`packages/core/src/parser/parser.ts:10-48`, `packages/extension/esbuild.mjs:39-215`).                                                                     |
| 7. Speed-first discipline       | **Mixed**                         | Activation is mostly async, but steady-state indexing is not incremental: `indexWorkspace` clears everything and `indexFile` always reparses/rewrites (`packages/extension/src/commands/indexWorkspace.ts:92-145`, `packages/core/src/index.ts:77-118`).                                                                                          |
| 8. Test coverage on hot symbols | **No critical miss found**        | Conservative scan found no fan-in-`>=5` runtime symbol with zero direct/sibling test evidence. This is better than expected.                                                                                                                                                                                                                      |
| 9. Dead code / drift            | **Fail**                          | `isWebviewToHostMessage` appears exported but unused (`packages/extension/src/webview/protocol/messages.ts:98-102`); Alfred prompt docs omit `pr-blast-radius.md` and point at `.dextree/prompts/` while built-ins live in `.dextree/alfred/` (`.dextree/alfred/_README.md:111-133`).                                                             |
| 10. Build hygiene               | **Mostly good, one real blocker** | pnpm + turbo are in place, `workspace:*` is used for the internal dep, strictness flags are enabled, no circular package dependency is apparent, but workspace typecheck is broken (`tsconfig.base.json:2-24`, `packages/extension/package.json:48-78`).                                                                                          |
| 11. Error isolation             | **Mostly good**                   | One bad file does not kill the workspace index (`packages/extension/src/commands/indexWorkspace.ts:128-145`), but graph refresh failures disappear with no user signal (`packages/extension/src/extension.ts:126-131`).                                                                                                                           |
| 12. Logging / observability     | **Weak**                          | Extension logging is a thin `OutputChannel` wrapper (`packages/extension/src/logger.ts:1-28`); webview runtime still uses raw `console.error` for renderer and layout failures (`packages/extension/src/webview/components/GraphView.tsx:865-991`).                                                                                               |

### 1.3 Ranked findings

1. ```text
   {
     severity: "Critical",
     file: "packages/core/src/storage/schema.ts",
     symbol_or_section: "initializeSchema / design §8",
     issue: "The live schema is still missing core design entities, migration scaffolding, and schema-registry infrastructure.",
     why_it_matters: "If S4/S6/S8 keep building on the current wire format, Dextree will lock in the wrong graph contract. Today there is no `Annotation`, `Module`, or `Test` table, no `_schema_version` registry table, no migration runner, and no evidence of DuckPGQ/`vss`/`fts` enablement. That means every future slice that assumes those surfaces exist is building on intent, not storage reality.",
     fix_suggestion: "Promote ROADMAP S3.5 from 'pre-S4 prerequisite' to an explicit release gate. Land `packages/core/src/storage/migrations/001-initial.sql`, an `applyMigrations()` runner, a schema registry table, the missing entities, and the missing index set before shipping more graph semantics.",
     effort: "L"
   }
   ```
2. ```text
   {
     severity: "Critical",
     file: "packages/core/src/parser/extractor.ts",
     symbol_or_section: "extractTypeScriptFile / extractPlainFile",
     issue: "The extractor plugin contract from design §8.6 does not exist; extraction is still hardcoded into one parser path plus a plain-file fallback.",
     why_it_matters: "This is the root cause of several roadmap lies at once: multi-language indexing, framework route extraction, and pass-2 upgrade discipline all presume a registry-based contract that can compose extractors. Right now Dextree recognizes more extensions than it meaningfully parses, which makes the language story look broader than it is.",
     fix_suggestion: "Add `Extractor`, `ExtractorRegistry`, and per-language registrants before any S8.5 or S11.5 work. Refactor the current TypeScript extractor and plain-file fallback into registry entries rather than ad hoc branching in `Indexer.indexFile`.",
     effort: "M"
   }
   ```
3. ```text
   {
     severity: "High",
     file: "packages/core/src/storage/repository.ts",
     symbol_or_section: "replaceFileGraph / CALLS data path",
     issue: "The runtime graph never writes `CALLS`, but the query layer and UI already behave as if call edges exist.",
     why_it_matters: "This is a user-visible truthfulness bug, not just a roadmap gap. `replaceFileGraph()` inserts files, symbols, import refs, and `DEFINES` edges only. `getWorkspaceSubgraph()` still queries `call_site`, and the webview legend/empty-state preview both advertise `CALLS`. Bala will demo a relation that the current indexer cannot possibly materialize.",
     fix_suggestion: "Either emit naive `CALLS` in S4 exactly as the roadmap now says, or remove `CALLS` from the UI until that lands. Do not leave the product in a half-promised state.",
     effort: "M"
   }
   ```
4. ```text
   {
     severity: "High",
     file: "packages/extension/src/commands/indexWorkspace.ts",
     symbol_or_section: "createIndexWorkspaceCommand",
     issue: "Workspace indexing still behaves like a clean-room reimport, not an incremental graph refresh.",
     why_it_matters: "The current loop clears the whole workspace before reindex and then calls `indexFile()` for every discovered file. `indexFile()` always reparses and rewrites. That contradicts the speed-first thesis and makes 'index once, render everywhere' feel fake the moment the repo grows beyond a toy.",
     fix_suggestion: "Make S6 hash-skip mandatory and measurable. Compare content hash before parse, avoid DB writes on unchanged files, and wire S6.5 watcher events into the same dirty-file path before calling v0.1 'usable'.",
     effort: "M"
   }
   ```
5. ```text
   {
     severity: "High",
     file: "packages/core/src/storage/db.ts",
     symbol_or_section: "openDatabase",
     issue: "Native runtime dependencies have no fallback path or environment doctor.",
     why_it_matters: "If `@duckdb/node-api` does not load, Dextree has no DuckDB story. If the packaged tree-sitter WASM assets are missing or blocked, Dextree has no parser story. `esbuild.mjs` does a decent job copying optional assets for known targets, but runtime failure still degrades to 'you are broken' with no rescue path. Windows ARM, Alpine, and locked-down enterprise installs are the obvious casualties.",
     fix_suggestion: "Short term: add an explicit startup environment doctor with actionable remediation and packaging self-checks. Medium term: decide whether a WASM DuckDB fallback is worth the complexity or whether the product will remain native-only and say so plainly.",
     effort: "M"
   }
   ```
6. ```text
   {
     severity: "Medium",
     file: "packages/extension/package.json",
     symbol_or_section: "contributes / README truthfulness",
     issue: "Docs and command surface are materially out of sync with the shipped extension.",
     why_it_matters: "The repo currently advertises Mermaid export, blast radius, Alfred prompts, extra packages, DuckPGQ-backed graph queries, and a much broader surface area than the code actually exposes. That is worse than being unfinished because it trains reviewers and early users to distrust both the README and the roadmap.",
     fix_suggestion: "Add a v0.1 release-truth gate: README, marketplace metadata, and command list must match the contributed commands in `packages/extension/package.json` exactly. Until then, delete promises rather than polishing them.",
     effort: "S"
   }
   ```
7. ```text
   {
     severity: "Medium",
     file: "packages/core/src/query/pagerank.ts",
     symbol_or_section: "computeNodeImportance",
     issue: "The workspace typecheck is red even though lint and tests are green.",
     why_it_matters: "This is the exact kind of baseline dishonesty that will poison CI confidence later. The declaration shim for `graphology-pagerank` exists, but the extension package's typecheck path does not see it when `@dextree/core` resolves to source. That means the repo currently has one broken validation leg hidden behind otherwise green local feedback.",
     fix_suggestion: "Fix declaration visibility now as part of 004/005 CI foundation work. Either expose the shim through a package-level `types` include that extension typecheck can see, or stop resolving the extension against raw core source during typecheck.",
     effort: "S"
   }
   ```
8. ```text
   {
     severity: "Medium",
     file: "packages/extension/src/extension.ts",
     symbol_or_section: "refreshGraphIfOpen",
     issue: "Graph refresh failures are swallowed silently, which undermines diagnosis of cache and startup bugs.",
     why_it_matters: "Per-file indexing errors are at least logged. Graph refresh errors vanish inside a fire-and-forget async wrapper, which means the exact class of failures Bala will care about during S5/S6 validation can disappear without any user-facing hint or even an OutputChannel breadcrumb.",
     fix_suggestion: "Log refresh failures with workspace/cache context and push a minimal non-blocking warning state into the webview instead of pretending everything is fine.",
     effort: "S"
   }
   ```
9. ```text
   {
     severity: "Low",
     file: ".dextree/alfred/_README.md",
     symbol_or_section: "prompt format + built-in prompt inventory",
     issue: "The Alfred docs already drift internally even before the runtime exists.",
     why_it_matters: "The prompt README says prompts default to `.dextree/prompts/`, documents a Mustache-like format, and lists six built-ins, but the repo actually stores built-ins in `.dextree/alfred/` and includes an undocumented `pr-blast-radius.md`. If the docs are drifting before Alfred exists, the future runtime is likely to hard-code the wrong assumptions.",
     fix_suggestion: "When Alfred becomes real, treat the prompt directory, templating engine, and built-in prompt registry as one schema-owned contract. Do not let docs speculate ahead of code.",
     effort: "S"
   }
   ```

### 1.4 Non-findings worth protecting

- **No VS Code leakage in core**. `packages/core` stayed clean.
- **No live privacy regression**. There is no hidden network path or default-on telemetry because the AI layer has not shipped.
- **Per-file failure isolation is already the right instinct**. The workspace loop is not catastrophically brittle.

## 2. Competitive Path Check

### 2a. Feature matrix

Split into two tables for width; columns are unchanged from the requested matrix.

#### Engine / data / integration

| Feature                                             | GitNexus                                                                 | codegraph                                                         | CodeIndexer                                | Aider RepoMap                                    | Code Pathfinder                                  | CodeGraphy                                            | Dextree (current)                                                                                            | Dextree (roadmap target)                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Language count + list                               | 14 listed: TS/JS/Python/Java/Kotlin/C#/Go/Rust/PHP/Ruby/Swift/C/C++/Dart | 19+ listed; broad repo-first coverage                             | 13 listed in README                        | Unknown exact count; broad text repo-map support | Unknown                                          | Language-agnostic file graph, not true symbol parsing | 8 extensions discovered; real symbol extraction only for TS/JS/TSX/JSX, `.py`/`.md` fall back to plain files | v0.2 target is 5 real pass-1 languages to start (TS/JS/Python/Go/Rust) via registry |
| Pass 1 parser                                       | Tree-sitter native/WASM                                                  | Tree-sitter-based static analysis                                 | Tree-sitter / AST-oriented static analysis | Tree-sitter / tag extraction for text repo map   | Public docs say 5-pass AST/static analysis       | File-level link scan                                  | `web-tree-sitter` for TS-like files; plain-file fallback for everything else                                 | Registry-based multi-language tree-sitter pass 1                                    |
| Pass 2 / semantic resolver                          | Semantic graph/native analyzers; exact LSP story unclear                 | Static resolvers and framework analyzers; exact LSP story unclear | Unknown / unclear                          | None                                             | Static multi-pass resolver; no public LSP detail | None                                                  | None                                                                                                         | LSP/compiler-as-library upgrade-in-place in S8                                      |
| Storage backend                                     | LadybugDB (native/WASM)                                                  | SQLite + FTS5                                                     | Milvus / Zilliz + local metadata           | In-memory text map                               | Local/private; exact backend unknown             | In-memory VS Code view state                          | DuckDB file only; no DuckPGQ/`vss`/`fts` use in code yet                                                     | DuckDB + DuckPGQ + optional `fts`/`vss`                                             |
| Incremental indexing                                | Unknown                                                                  | File watcher + auto-sync                                          | Merkle-tree sync                           | Full map regeneration                            | Unknown                                          | Manual/full refresh                                   | Full clear + full reparse on workspace index                                                                 | Hash-skip in S6; watcher in S6.5; Merkle optional later                             |
| MCP server                                          | Yes                                                                      | Yes                                                               | Yes                                        | No                                               | Yes                                              | No                                                    | No                                                                                                           | Read-only in v0.2, write tools in v0.3                                              |
| Embeddings / vector search                          | Unknown                                                                  | No public claim                                                   | Yes                                        | No                                               | Unknown                                          | No                                                    | No                                                                                                           | Opt-in later (`vss`)                                                                |
| Diagnostics overlay                                 | No VS Code moat                                                          | No                                                                | Unknown                                    | No                                               | Unknown                                          | No                                                    | No                                                                                                           | Yes in S9                                                                           |
| Git history overlay                                 | Partial repo/PR awareness, not VS Code-native                            | No public claim                                                   | Unknown                                    | No                                               | Unknown                                          | No                                                    | No                                                                                                           | Yes in S10                                                                          |
| Test linkage overlay                                | Unknown                                                                  | No public claim                                                   | Unknown                                    | No                                               | Unknown                                          | No                                                    | No                                                                                                           | Yes in S10.5                                                                        |
| Framework route detection (count of frameworks)     | Unknown                                                                  | 14                                                                | Unknown                                    | 0                                                | Unknown                                          | 0                                                     | 0                                                                                                            | 5 to start in S11.5                                                                 |
| LLM integration (BYOK? built-in? prompts editable?) | AI/report surfaces; exact BYOK story unclear                             | MCP-only, not a built-in assistant                                | Built-in model integrations; BYOK-friendly | Built-in BYOK chat + repo map                    | MCP-first; built-in UI unknown                   | None                                                  | None                                                                                                         | Alfred BYOK, opt-in, editable prompts in v0.4                                       |
| Multi-repo / cross-repo                             | Yes; repo groups are a selling point                                     | Unknown                                                           | Unknown                                    | No                                               | Unknown                                          | No                                                    | No                                                                                                           | Full merged federation in v0.6                                                      |

#### Product surface / go-to-market

| Feature                                                     | GitNexus                                                     | codegraph           | CodeIndexer            | Aider RepoMap | Code Pathfinder            | CodeGraphy           | Dextree (current)                               | Dextree (roadmap target)                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------- | ---------------------- | ------------- | -------------------------- | -------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| In-IDE visual UI                                            | No; browser-first                                            | No                  | Yes, VS Code extension | No            | No public visual UI        | Yes, VS Code webview | Yes, VS Code tree + graph webview               | Yes, still core wedge                                      |
| Standalone web/desktop UI                                   | Yes, web app                                                 | No public visual UI | Unknown                | Terminal only | No public visual UI        | No                   | No                                              | Web component later                                        |
| Export formats (Mermaid, Canvas, SCIP, PNG, PDF, SVG, JSON) | Unknown                                                      | Unknown             | Unknown                | Text repo map | Unknown                    | None                 | None                                            | Mermaid v0.1; SCIP first in v0.3; Canvas/PNG/PDF/SVG after |
| License                                                     | NOASSERTION on GitHub; README signals PolyForm Noncommercial | MIT                 | MIT                    | Apache-2.0    | Apache-2.0 per public docs | MIT                  | MIT                                             | MIT                                                        |
| Stars / community activity (last 90 days)                   | 39,731 stars / 895 commits                                   | 15,755 / 188        | 0 / 0                  | 45,145 / 44   | Unknown / Unknown          | 11 / 0               | Unknown external signal / active local worktree | Unknown until release                                      |
| Last meaningful commit date                                 | 2026-05-22                                                   | 2026-05-22          | 2025-07-15             | 2026-05-22    | Unknown                    | 2023-03-12           | 2026-05-22 local activity                       | Planned through v0.6                                       |
| Maintenance status                                          | Active                                                       | Active              | Stale                  | Active        | Unknown                    | Dormant              | Active but pre-release                          | Planned                                                    |

**Competitor reference points (HEADs used for this audit):**

- GitNexus — <https://github.com/abhigyanpatwari/GitNexus/commit/87b91c821e412f4b80d91137225c2d6f0dbb3ce5>
- codegraph — <https://github.com/colbymchenry/codegraph/commit/5aae9c4bbff4fe02f8284ef5f91dd9d5391027f6>
- CodeIndexer — <https://github.com/z23cc/CodeIndexer/commit/fa650aadc3cf040fb355def276a77c783f15b2d5>
- CodeGraphy — <https://github.com/joesobo/CodeGraphy/commit/c59a0c931354097c6ce985aa808f06a0e89a0ba8>
- Aider — <https://github.com/Aider-AI/aider/commit/5dc9490bb35f9729ef2c95d00a19ccd30c26339c>
- SCIP — <https://github.com/scip-code/scip/commit/99236e35450ccd8b87fe58c38d31fd499d0ffdfa>
- duckdb-vscode feasibility proof — <https://github.com/ChuckJonas/duckdb-vscode/commit/2567e3ffb21e37524da90bc88662fb82f9b7a922>
- Code Pathfinder — public reference only: <https://codepathfinder.dev/mcp>

### 2b. Gap analysis

#### 1. Real moat (Dextree wins now, not hypothetically)

| Moat                                  | Why it is real now                                                                                                                                                                                      | Caveat                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| VS Code-native symbol graph surface   | Dextree already has a local graph webview plus tree surface in the extension host, not a browser tab (`packages/extension/src/extension.ts:165-227`, `packages/extension/src/webview/App.tsx:158-272`). | The moat is still thin because diagnostics/git/tests are not fused yet. |
| Persisted local cache for safe reopen | The reopened-graph path is already real and bounded by cache validation (`packages/extension/src/commands/openGraphView.ts:21-47`, `packages/extension/src/extension.ts:68-119`).                       | It is a restart moat, not an ongoing-sync moat yet.                     |

**Blunt version:** the strategic moat thesis is still mostly roadmap, not shipped product. The real differentiator today is **“there is a VS Code graph UI at all”**, not yet **“the graph carries signals nobody else can access.”**

#### 2. Roadmap closes the gap

| Gap                                         | Roadmap slice             | Audit call                                                                                    |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| MCP is too late                             | `S10.7` in v0.2           | **Fixed already.** Keep it there; v0.3 would have been late.                                  |
| SCIP should precede prettier exports        | `E1a` in v0.3             | **Fixed already.** Correct sequencing.                                                        |
| RepoMap/PageRank should not wait for Alfred | `S11.7` in v0.2           | **Mostly fixed.** The ranking engine moved early; the repo-map text surface did not.          |
| Incremental indexing is strategically early | `S6` + `S6.5` in v0.1     | **Fixed in roadmap, not in code.** This remains a delivery problem, not a sequencing problem. |
| Route detection and test linkage matter     | `S10.5` + `S11.5` in v0.2 | **Good.** These are the moat features that make the VS Code thesis credible.                  |

#### 3. Roadmap does **not** close the gap

| Name                     | Why                                                                                                                           | Target version | Effort | Dependency    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------------- |
| `repo-map-text-snapshot` | Alfred should not be the first time the user sees repo-map value; a text snapshot is useful on its own and lowers trust risk. | v0.2           | M      | `S11.7`       |
| `environment-doctor`     | Native dependency failures are too likely to leave as silent startup pain.                                                    | v0.1           | M      | `S5`          |
| `session-summary-export` | Telemetry is intentionally off by default; Bala still needs a user-pull feedback loop.                                        | v0.1           | S      | `S6`          |
| `repo-groups-read-only`  | Full merged federation can stay late, but teams need a lighter multi-repo lens earlier than v0.6.                             | v0.4           | M      | `S10.7`, `S5` |
| `release-truth-gate`     | Public docs and metadata cannot keep outrunning the binary.                                                                   | v0.1           | S      | none          |

### 2c. Specific roadmap decisions

| Question                                  | Recommendation                                                                                                                 | Why                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Move incremental indexing into v0.1?  | **Yes, but only the honest minimum.** Keep hash-skip and watcher in v0.1; do **not** make Merkle persistence a pre-alpha gate. | The code already persists `file.hash`; the missing piece is using it. Merkle is a good later acceleration, not the first unblocker.                                  |
| (b) Move Aider RepoMap ranking into v0.2? | **Yes, and the roadmap already does.** Also add a repo-map text view in v0.2.                                                  | The algorithm is small and leverage-heavy. Waiting until Alfred wastes a cheap substrate improvement.                                                                |
| (c) Ship SCIP before Canvas/PDF?          | **Yes.** Keep the current roadmap order.                                                                                       | SCIP is the cheapest credibility and interoperability win. Canvas/PDF are nicer demos, but SCIP creates ecosystem gravity.                                           |
| (d) Is late multi-repo acceptable?        | **Full merged graph late is acceptable; zero earlier story is not.**                                                           | Mid-size teams do need a repo-group view. But a light read-only grouping lens is enough before doing globally-addressable symbol IDs and cross-repo edge resolution. |
| (e) Is MCP in v0.3 too late?              | **Yes, it would have been.** v0.2 read-only is the right compromise.                                                           | Every serious competitor leads with MCP or AI connectivity. v0.1 should stay focused on making the graph truthful before freezing the external contract.             |

## 3. UI / UX Differentiation

### 3a. Feature proposals

| Name                            | Problem solved                                                           | Design in words                                                                                                                                                                                                                         | VS Code constraints respected                                             | Effort | Target version | Prior art reference                                        |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | -------------- | ---------------------------------------------------------- |
| Graph minimap                   | Dense graphs lose orientation fast.                                      | Add a tiny always-on minimap in the lower-right corner that shows the full graph silhouette plus the current viewport rectangle. Clicking the minimap recenters the main canvas; no second renderer, just a simplified static overview. | Yes — CSS vars for chrome, Codicons for controls, no extra icon library.  | M      | v0.1           | Sigma demos, Obsidian Graph View                           |
| Time-travel slider              | Git overlays are hard to internalize as static color.                    | Add a horizontal commit slider above the graph that replays node/edge birth, churn, and deletions across selected commits. Keep the main layout stable so the user reads evolution, not animation chaos.                                | Yes — webview-only UI, color tokens routed through export palette system. | L      | v0.3           | GitHub repo visualizer, Sentry trend panels                |
| Reverse architecture pathfinder | “How does A reach B?” is a top workflow and current UI cannot answer it. | Let the user pick two files or symbols and compute the shortest import/call path between them. Render the result as a focused corridor overlay with side-panel provenance instead of blowing away the global graph.                     | Yes — no stack violation; fits Sigma + side panel.                        | M      | v0.2           | Sentry drill-down patterns, Sourcegraph Cody symbol focus  |
| Heat overlays                   | Raw structure lacks urgency.                                             | Add toggleable overlays for diagnostics density, churn density, and test coverage. Same graph, three lenses, with a compact legend and keyboard cycling.                                                                                | Yes — CSS vars in webview, artifact themes via semantic tokens.           | M      | v0.2           | CodeSee annotations, Vercel dashboard filters              |
| Lens presets                    | Repeated graph queries need memory.                                      | Save named query presets like “unused public exports touched this week” or “high fan-in files with no tests”. Presets are serialized as simple query JSON and show up in a quick switcher.                                              | Yes — pure extension + webview, no prohibited storage pattern.            | M      | v0.2           | Linear saved views, DeepWiki topic lenses                  |
| Sticky symbol breadcrumbs       | Navigation context disappears after pan/zoom.                            | Pin the last 3 selected nodes as breadcrumb chips above the canvas, each with one-click refocus and a “compare” affordance. This keeps narrative continuity during exploration without a full split view.                               | Yes — Codicons + CSS Modules only.                                        | S      | v0.1           | Cody context chips, browser tab trails                     |
| Detachable detail panels        | Users need to compare node details without losing the graph.             | Make hover/selection details detachable into docked side panels inside the webview, not separate windows. Two panels max keeps it linear, not IDE-inside-IDE.                                                                           | Yes — still one webview, no custom native windows.                        | M      | v0.2           | Cody panels, Vercel dashboard composition                  |
| Snapshot diff                   | Reindex effects are invisible today.                                     | Let users compare two saved graph snapshots side-by-side or as an overlay, with added/removed/changed edges called out. This is the visual sibling of blast radius.                                                                     | Yes — same shared graph; exports can reuse it later.                      | L      | v0.3           | Git diff views, DeepWiki narrative + diagram interleave    |
| Spotlight onboarding            | First render is blob anxiety.                                            | Offer a “show me the 5 most central nodes first” onboarding mode that greys out the rest and narrates one hint at a time. Exit is instant and obvious.                                                                                  | Yes — uses existing PageRank once real, no rule violation.                | S      | v0.1           | Obsidian graph depth controls, Linear onboarding restraint |
| Keyboard-first graph navigation | Mouse-only graph UX is slow and un-Like-Linear.                          | Add `j/k` to cycle ranked nodes, `f` to focus, `/` to filter, `o` to open source, `?` for cheatsheet. The selection ring becomes the primary navigation state, not just hover.                                                          | Yes — Codicons only, no custom shortcut framework required.               | S      | v0.1           | Linear, Cody                                               |
| “Why is this here?” provenance  | Edge semantics are opaque.                                               | Clicking an edge should open an inline provenance card showing the exact import statement, call site, or diagnostic span that created it. This turns the graph from inference into evidence.                                            | Yes — extension can push source snippets; no architecture violation.      | M      | v0.2           | Sentry span drill-down, Sourcegraph hover provenance       |
| “Blame the graph” hover         | Git metadata is more useful spatially than in a side list.               | On hover, show last author, last three commits, and 30-day churn right in the node card. Add an optional canvas overlay mode for “recently hot” nodes.                                                                                  | Yes — depends on S10 but fits current UI rules cleanly.                   | M      | v0.2           | GitHub blame, CodeSee metadata overlays                    |

### 3b. Color theme system

#### Inline `theme-tokens.md` spec

**Design rule:** no renderer should consume raw colors directly. Webview surfaces resolve semantic tokens to VS Code CSS variables; artifact exporters resolve the same tokens to explicit palette hex values.

| Token                   | In-IDE source                            | Meaning                      |
| ----------------------- | ---------------------------------------- | ---------------------------- |
| `color.surface.0`       | `--vscode-editor-background`             | Primary canvas background    |
| `color.surface.1`       | `--vscode-sideBar-background`            | Side panel / card background |
| `color.surface.2`       | `--vscode-editorWidget-background`       | Raised panels / menus        |
| `color.surface.3`       | `--vscode-panel-border`                  | Borders / separators         |
| `color.text.primary`    | `--vscode-foreground`                    | Main text                    |
| `color.text.muted`      | `--vscode-descriptionForeground`         | Secondary text               |
| `color.text.accent`     | `--vscode-textLink-foreground`           | Active accent / links        |
| `color.node.file`       | `--vscode-symbolIcon-fileForeground`     | File nodes                   |
| `color.node.function`   | `--vscode-symbolIcon-functionForeground` | Function nodes               |
| `color.node.class`      | `--vscode-symbolIcon-classForeground`    | Class nodes                  |
| `color.node.module`     | `--vscode-symbolIcon-moduleForeground`   | Module / namespace nodes     |
| `color.node.test`       | `--vscode-testing-iconPassed`            | Test nodes                   |
| `color.node.annotation` | `--vscode-editorInfo-foreground`         | Annotation / metadata nodes  |
| `color.edge.defines`    | `--vscode-panel-border`                  | Structural `DEFINES` edges   |
| `color.edge.imports`    | `--vscode-textLink-foreground`           | `IMPORTS` edges              |
| `color.edge.calls`      | `--vscode-charts-orange`                 | `CALLS` edges                |
| `color.edge.testedBy`   | `--vscode-testing-iconPassed`            | `TESTED_BY` edges            |
| `color.edge.annotates`  | `--vscode-editorInfo-foreground`         | `ANNOTATES` edges            |
| `color.flag.unused`     | `--vscode-editorWarning-foreground`      | Unused / dead-code warning   |
| `color.flag.complexity` | `--vscode-charts-yellow`                 | Complexity risk              |
| `color.flag.diagnostic` | `--vscode-editorError-foreground`        | Diagnostic severity          |
| `color.flag.churn`      | `--vscode-charts-purple`                 | Churn / git heat             |

#### Shipped artifact palettes

```json
{
  "name": "Default Light",
  "color.surface.0": "#F7F9FC",
  "color.surface.1": "#FFFFFF",
  "color.surface.2": "#EEF2F7",
  "color.surface.3": "#D7DEE8",
  "color.text.primary": "#18212B",
  "color.text.muted": "#5B6673",
  "color.text.accent": "#005FB8",
  "color.node.file": "#0072B2",
  "color.node.function": "#E69F00",
  "color.node.class": "#009E73",
  "color.node.module": "#CC79A7",
  "color.node.test": "#F0E442",
  "color.node.annotation": "#D55E00",
  "color.edge.defines": "#7A8694",
  "color.edge.imports": "#56B4E9",
  "color.edge.calls": "#D55E00",
  "color.edge.testedBy": "#009E73",
  "color.edge.annotates": "#CC79A7",
  "color.flag.unused": "#D55E00",
  "color.flag.complexity": "#CC79A7",
  "color.flag.diagnostic": "#C0392B",
  "color.flag.churn": "#7A4FB0"
}
```

```json
{
  "name": "Default Dark",
  "color.surface.0": "#11161C",
  "color.surface.1": "#161D24",
  "color.surface.2": "#1E2630",
  "color.surface.3": "#2B3642",
  "color.text.primary": "#E6EDF3",
  "color.text.muted": "#9AA7B3",
  "color.text.accent": "#56B4E9",
  "color.node.file": "#0072B2",
  "color.node.function": "#E69F00",
  "color.node.class": "#009E73",
  "color.node.module": "#CC79A7",
  "color.node.test": "#F0E442",
  "color.node.annotation": "#D55E00",
  "color.edge.defines": "#7F8C99",
  "color.edge.imports": "#56B4E9",
  "color.edge.calls": "#D55E00",
  "color.edge.testedBy": "#009E73",
  "color.edge.annotates": "#CC79A7",
  "color.flag.unused": "#D55E00",
  "color.flag.complexity": "#CC79A7",
  "color.flag.diagnostic": "#FF6B6B",
  "color.flag.churn": "#A06CD5"
}
```

```json
{
  "name": "Print",
  "color.surface.0": "#FFFFFF",
  "color.surface.1": "#FFFFFF",
  "color.surface.2": "#F2F2F2",
  "color.surface.3": "#D9D9D9",
  "color.text.primary": "#111111",
  "color.text.muted": "#555555",
  "color.text.accent": "#000000",
  "color.node.file": "#1A1A1A",
  "color.node.function": "#404040",
  "color.node.class": "#666666",
  "color.node.module": "#8C8C8C",
  "color.node.test": "#B3B3B3",
  "color.node.annotation": "#000000",
  "color.edge.defines": "#7A7A7A",
  "color.edge.imports": "#4D4D4D",
  "color.edge.calls": "#1A1A1A",
  "color.edge.testedBy": "#5C5C5C",
  "color.edge.annotates": "#8C8C8C",
  "color.flag.unused": "#000000",
  "color.flag.complexity": "#555555",
  "color.flag.diagnostic": "#000000",
  "color.flag.churn": "#737373"
}
```

```json
{
  "name": "Dextree Forest",
  "color.surface.0": "#0E1712",
  "color.surface.1": "#132019",
  "color.surface.2": "#1B2B22",
  "color.surface.3": "#274032",
  "color.text.primary": "#E7F2E8",
  "color.text.muted": "#A9C0AE",
  "color.text.accent": "#7BC47F",
  "color.node.file": "#4DA3D9",
  "color.node.function": "#E7B24B",
  "color.node.class": "#54B58C",
  "color.node.module": "#C38CC5",
  "color.node.test": "#D9D76A",
  "color.node.annotation": "#D97A4D",
  "color.edge.defines": "#7FA38C",
  "color.edge.imports": "#72C3E9",
  "color.edge.calls": "#D97A4D",
  "color.edge.testedBy": "#54B58C",
  "color.edge.annotates": "#C38CC5",
  "color.flag.unused": "#D97A4D",
  "color.flag.complexity": "#C38CC5",
  "color.flag.diagnostic": "#FF8F70",
  "color.flag.churn": "#8D7AE6"
}
```

#### Color-blind safety check

Approximate simulated swatches for the shared non-print node palette:

| Token                   | Normal    | Deuteranopia (approx) | Protanopia (approx) | Tritanopia (approx) |
| ----------------------- | --------- | --------------------- | ------------------- | ------------------- |
| `color.node.file`       | `#0072B2` | `#3A55B1`             | `#546BB6`           | `#008485`           |
| `color.node.function`   | `#E69F00` | `#DDAB04`             | `#CA9700`           | `#FF826F`           |
| `color.node.class`      | `#009E73` | `#6E7076`             | `#8F8871`           | `#00A490`           |
| `color.node.module`     | `#CC79A7` | `#8D92A5`             | `#7C87A9`           | `#D97987`           |
| `color.node.test`       | `#F0E442` | `#FFE047`             | `#FFD53A`           | `#FFCBB3`           |
| `color.node.annotation` | `#D55E00` | `#9F7B02`             | `#836200`           | `#FF4742`           |

**Hard conclusion:** color alone is still not enough. Under red-green deficiencies, `file`, `class`, and `module` compress too much. So the export system should require a secondary channel:

- file = circle
- function = rounded square
- class = hexagon
- module = capsule
- test = diamond
- annotation = octagon

For **Print**, assume grayscale and rely on shape + label + line style first, hue second.

#### Theme editor timing

Do **not** pull the full theme editor into v0.1. Native VS Code settings are shippable for pre-alpha if:

1. v0.1 ships the four preset palettes above,
2. Mermaid/export commands can choose among them, and
3. one preview screenshot per theme appears in docs.

The conversion cost of “no custom theme editor yet” is small. The conversion cost of ugly or inconsistent exports is not.

### 3c. UX journey audit

| Journey step              | Current friction                                                                                                                 | Evidence                                                                                                                            | Fix                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `vsce install`            | No walkthrough, no status bar affordance, almost no discoverability outside command palette and tree title.                      | Only one toolbar contribution exists, on the Symbols view title (`packages/extension/package.json:114-121`).                        | Add a 30-second first-run walkthrough, a status bar “indexed / stale” badge, and a start-from-here welcome command.                |
| First index               | Command exists, but the product still behaves like batch import instead of live workspace state.                                 | `indexWorkspace` clears the workspace before reimport (`packages/extension/src/commands/indexWorkspace.ts:92-145`).                 | Keep progress, but add named phases, hash skip, and watcher-backed refresh before calling this “core loop complete.”               |
| First graph render        | “No cache” and “invalid cache” both collapse to empty graph; the user gets almost no explanation.                                | `openGraphView` pushes an empty graph when validation is not `ready` (`packages/extension/src/commands/openGraphView.ts:34-38`).    | Distinguish empty / stale / unreadable / not-yet-indexed states explicitly in the panel.                                           |
| First node click          | Good baseline selection/navigation, but there is no provenance panel and no path reasoning.                                      | Current actions are mostly select / open / clear (`packages/extension/src/webview/App.tsx:224-272`).                                | Add edge/source provenance and focused path exploration before piling on more chrome.                                              |
| First filter              | There is no real filter surface yet.                                                                                             | No filter/search controls in `App.tsx:158-272`.                                                                                     | Add `/` quick filter and a tiny lens switcher before building a full query builder.                                                |
| First Mermaid export      | The README promises it; the extension does not contribute it.                                                                    | `README.md:60-68` vs `packages/extension/package.json:90-113`.                                                                      | Do not mention export commands publicly until they exist. When they do, expose them in panel chrome, not just the command palette. |
| First Alfred report       | Prompt docs exist, runtime does not.                                                                                             | `.dextree/alfred/_README.md:93-133`; no Alfred package under `packages/`.                                                           | Ship repo-map text view first, Alfred second.                                                                                      |
| First re-index after save | Still manual. Saving an unchanged file is not a no-op today.                                                                     | `packages/core/src/index.ts:77-118`, `packages/extension/src/commands/indexWorkspace.ts:101-145`.                                   | Make save-time refresh and hash-skip a release criterion, not a stretch goal.                                                      |
| First error               | Unreadable cache gets a warning, but renderer refresh failures are swallowed and native dependency failures have no doctor flow. | `packages/extension/src/extension.ts:82-87`, `packages/extension/src/extension.ts:126-131`, `packages/core/src/storage/db.ts:9-22`. | Add a single “Dextree Doctor” surface with asset checks, DuckDB binding diagnosis, and copyable support output.                    |

#### Specific friction calls

- **First-run experience:** there is **no** 30-second guided tour today.
- **Empty states:** current empty state is competent but still slightly dishonest because it previews `CALLS` even though the runtime graph cannot emit them yet (`packages/extension/src/webview/components/EmptyState.tsx:12-26`).
- **Error states that need first-class handling:** DuckDB binary missing, tree-sitter WASM missing, LSP not ready, 50K-file monorepo, proxy/corporate restrictions.
- **Settings UI:** native VS Code settings are acceptable for v0.1. Do not burn early cycles on a custom settings webview before exports and Alfred are real.
- **Telemetry / product learning:** use a **user-pull session summary**. After an indexing session or export, offer “Copy summary” / “Open issue draft” / “Share anonymized report” from a local JSON + markdown bundle. No background telemetry, no surprise network traffic.

## 4. Proposed ROADMAP.md Diff

```diff
@@ Phase 1: v0.1 core loop
 #### S6.5 — Auto-sync watcher

-**Spec focus**: debounced FS watcher (FSEvents/inotify/RDCW via VS Code's
-`FileSystemWatcher`) with selective reparse. Closes the codegraph file-watcher gap.
+**Spec focus**: debounced FS watcher (FSEvents/inotify/RDCW via VS Code's
+`FileSystemWatcher`) with selective reparse. Closes the codegraph file-watcher gap.
+**Release rule**: this is a v0.1 exit criterion, not stretch work. Without save-time
+sync, the speed-first thesis collapses immediately after the first edit.

 +#### S6.8 — Session summary export (user-pull)
 +
 +**Spec focus**: ship a local-only feedback loop so pre-alpha users can share what
 +they actually used without default-on telemetry.
 +
 +**Code focus**: local JSON/Markdown session summary (index duration, file count,
 +commands used, doctor results, selected settings) plus commands to copy it, save it,
 +or open a prefilled GitHub issue draft.
 +
 +**Independent proof**: after indexing and opening the graph, the user can export a
 +scrubbed session summary without any network call.
 +
 +#### S6.9 — Release-truth gate
 +
 +**Spec focus**: prevent docs and marketplace copy from getting ahead of the binary.
 +
 +**Code focus**: release checklist item that README, package metadata, and contributed
 +commands/settings must match the shipped extension exactly.
 +
 +**Independent proof**: every command named in README/package metadata exists in
 +`packages/extension/package.json`, and every listed package exists under `packages/`.
 @@ Phase 2: v0.2 moat features
 #### S11.7 — PageRank symbol ranking + community overlay

 +#### S11.8 — Repo-map text snapshot
 +
 +**Spec focus**: turn the PageRank work into a user-visible text artifact before
 +Alfred arrives.
 +
 +**Code focus**: `Dextree: Show repo-map` command emitting token-budgeted text built
 +from top-ranked symbols/files, with copy/save actions and no LLM dependency.
 +
 +**Independent proof**: on a 500-file repo, Dextree can generate a bounded repo-map
 +snapshot that is useful on its own and reusable by Alfred later.
 @@ Phase 4: v0.4 Alfred
 +#### S13.5 — Repo groups (read-only federation)
 +
 +**Spec focus**: lightweight multi-repo story before full merged-graph federation.
 +
 +**Code focus**: let users select multiple cached repos as a read-only group for
 +querying, searching, and side-by-side graph navigation without promising cross-repo
 +symbol resolution yet.
 +
 +**Independent proof**: a multi-folder workspace can switch scope between `repo A`,
 +`repo B`, and `repo group` before the full S14 merged-graph work lands.
```

**One-line rationale per change:**

1. **S6.5 as exit criterion** — because v0.1 without save-time sync still feels like batchware, not a living graph.
2. **S6.8 session summary export** — because telemetry stays off by default and Bala still needs signal.
3. **S6.9 release-truth gate** — because the docs are already outrunning the code.
4. **S11.8 repo-map text snapshot** — because RepoMap should create product value before Alfred consumes it.
5. **S13.5 repo groups** — because full merged federation can stay later, but zero earlier multi-repo story leaves a real hole.

## 5. Risks & Open Questions

| Risk / unknown                                                                            | Why this audit could not settle it                                                                                 | Fastest experiment                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Real cold-start and first-render latency on medium/large repos                            | Static inspection shows the obvious full-reparse problem, but not end-user latency on 500/5,000/50,000-file repos. | Run a timed benchmark suite on 100, 500, and 5,000 supported files with clean vs warm cache.                          |
| Native dependency survivability on Windows ARM / Alpine / locked-down enterprise machines | The packaging script is careful, but I did not test those environments here.                                       | Build matrix `.vsix` packages and run a startup doctor smoke test on each target.                                     |
| Whether pass-1-only `CALLS` edges are good enough                                         | Design says “naive now, resolved later,” but current code has no naive call emission to evaluate.                  | Prototype naive call extraction on 3 representative repos and inspect false positives before freezing schema.         |
| How much multi-repo users actually need before v0.6                                       | The business argument is plausible; the current user base is too small to quantify.                                | Ship repo-group read-only support early to learn whether people need cross-repo traversal or just grouped visibility. |
| Code Pathfinder comparison quality                                                        | No canonical repo was supplied; public docs are too thin for a fully fair matrix.                                  | Find the canonical code repo or mark that competitor as “marketing-only evidence” in future revisions.                |
| Whether the graph UI is actually comprehensible at 300+ nodes                             | The current UI has a solid baseline, but I did not do a live usability study here.                                 | Run three 20-minute usability sessions with new users on a 300-node graph and observe where they stall.               |

## 6. Appendix — Raw Competitor Notes

### GitNexus

- **Stack:** tree-sitter + LadybugDB + browser UI + MCP/CLI. HEAD: <https://github.com/abhigyanpatwari/GitNexus/commit/87b91c821e412f4b80d91137225c2d6f0dbb3ce5>
- **Killer feature:** execution-flow and repo-group storytelling at web-app scale.
- **Weakness:** not VS Code-native; license story is not as permissive as MIT/Apache.
- **One-liner:** “Browser-native code intelligence platform for teams that want a graph product first and editor integration second.”

### codegraph

- **Stack:** tree-sitter-heavy repo analyzer + SQLite/FTS5 + CLI/MCP + file watcher. HEAD: <https://github.com/colbymchenry/codegraph/commit/5aae9c4bbff4fe02f8284ef5f91dd9d5391027f6>
- **Killer feature:** broad language count plus 14-framework route detection.
- **Weakness:** no in-IDE visual product; feels like infrastructure more than an experience.
- **One-liner:** “A practical local code-graph engine for AI tools and automation, not a human-first visual explorer.”

### CodeIndexer

- **Stack:** incremental Merkle sync + vector storage (Milvus/Zilliz) + VS Code + MCP. HEAD: <https://github.com/z23cc/CodeIndexer/commit/fa650aadc3cf040fb355def276a77c783f15b2d5>
- **Killer feature:** incremental indexing and vector-search posture.
- **Weakness:** currently looks stale and the public repo signal is weak.
- **One-liner:** “Embeddings-first code indexing with a practical sync story, but weak current traction.”

### Aider RepoMap

- **Stack:** text repo map built in Python from ranked tags, PageRank, and token-budget search. HEAD: <https://github.com/Aider-AI/aider/commit/5dc9490bb35f9729ef2c95d00a19ccd30c26339c>
- **Killer feature:** ridiculously cheap leverage per line of code; the weighting heuristics are battle-tested.
- **Weakness:** no persistent graph, no visual surface, no VS Code moat.
- **One-liner:** “The best small idea in the field: cheap ranking that makes large-repo AI usable.”

### SCIP

- **Stack:** protocol / CLI / protobuf interchange format. HEAD: <https://github.com/scip-code/scip/commit/99236e35450ccd8b87fe58c38d31fd499d0ffdfa>
- **Killer feature:** interoperability and ecosystem legitimacy.
- **Weakness:** not a user product; purely a strategic export target.
- **One-liner:** “Not a competitor; a distribution format Dextree should exploit.”

### duckdb-vscode

- **Stack:** VS Code extension proving DuckDB Node API is viable inside the extension host. HEAD: <https://github.com/ChuckJonas/duckdb-vscode/commit/2567e3ffb21e37524da90bc88662fb82f9b7a922>
- **Killer feature:** de-risks the core storage thesis.
- **Weakness:** no graph semantics; this is feasibility evidence, not product competition.
- **One-liner:** “Proof that DuckDB inside VS Code is sane.”

### CodeGraphy

- **Stack:** VS Code webview + force graph + file-level relationships. HEAD: <https://github.com/joesobo/CodeGraphy/commit/c59a0c931354097c6ce985aa808f06a0e89a0ba8>
- **Killer feature:** the simplest possible “graph in VS Code” baseline.
- **Weakness:** file-only, dormant, and architecturally shallow.
- **One-liner:** “A useful reminder that being in the editor matters, even if the graph is primitive.”

### Code Pathfinder

- **Stack:** public docs describe private/local 5-pass static analysis with MCP access. Public reference: <https://codepathfinder.dev/mcp>
- **Killer feature:** privacy-first MCP framing.
- **Weakness:** public evidence is too thin to benchmark confidently; no canonical repo was supplied.
- **One-liner:** “Positioning-first competitor until the code is inspectable.”

### Legacy crosswalk for existing ROADMAP.md references

The current `ROADMAP.md` still cites section numbers from the older scratch doc. Until Bala updates those references, use this crosswalk:

| Old scratch reference                     | New home in this rewrite             |
| ----------------------------------------- | ------------------------------------ |
| old `§3` Ranked Findings                  | `§1.3 Ranked findings`               |
| old `§7.4` MCP sequencing decision        | `§2c` row `(e)`                      |
| old `§7.5` multi-repo sequencing decision | `§2c` row `(d)` + `§4` diff          |
| old `§10.2` UI differentiation            | `§3a` and `§3c`                      |
| old `§11` theme token spec                | `§3b`                                |
| old `§13.2` GitNexus prior art            | `§2a` reference list + `§6 GitNexus` |
| old `§13.3` Aider RepoMap prior art       | `§2c` row `(b)` + `§6 Aider RepoMap` |

---

## Option B — Graph Cluster + Flow View Scratch (2026-05-23)

> **Constraint: no library replacements.** We stay on Sigma.js + graphology + ForceAtlas2 + framer-motion + React. Everything below adds visual layers on top of the existing stack.

### What we have today (baseline)

- `MultiDirectedGraph` (graphology) — holds nodes (`file` / `symbol`) + edges (`DEFINES` / `IMPORTS` / `CALLS`)
- Sigma.js WebGL renderer — handles node/edge drawing, camera, zoom
- ForceAtlas2 layout — 50 iterations at mount, then static
- SVG overlay (`dxt-selection-overlay`) — framer-motion animated dashes + traveler circles on hover/selection
- `nodeReducer` / `edgeReducer` — Sigma hooks that apply per-frame fading (`FADE_ALPHA = 0.06`)
- `computeDescendantSelection` BFS — walks DEFINES then CALLS from the clicked node
- `computeHoverNeighborhood` — immediate neighbours on hover

### Four features to add

---

#### B1 — Convex Hull Cluster Blobs

**Problem:** symbols from the same file scatter across the canvas with no grouping cue.  
**Solution:** a Canvas2D layer behind Sigma's WebGL canvas draws a translucent polygon per file, enclosing all its child symbols.

**How it fits in the existing code:**

- After `sigma = new Sigma(...)` and layout, insert a new `<canvas id="dxt-cluster-layer">` as a sibling of Sigma's canvas inside `#dxt-graph-container`. Give it `position: absolute; inset: 0; pointer-events: none; z-index: 0`.
- Sigma's canvas sits at `z-index: 1`.
- On `sigma.on("afterRender", drawHulls)` re-run the hull renderer. This event fires every time Sigma redraws (camera pan/zoom).
- `drawHulls` uses `sigma.graphToViewport(nodeId)` — already a public Sigma 3 method — to convert graph coordinates → pixel coordinates for each symbol node.
- Group symbol nodes by `filePath`. For each group with ≥ 3 points compute a convex hull (inline ~35-line Graham scan — no new npm dep needed).
- Draw: `ctx.fillStyle` = file-node color at 8% opacity; `ctx.strokeStyle` at 28% opacity, 1.5px dashed `[4, 6]`.
- On hover/selection: hovered file hull fills to 14%, others dim to 30% fill.
- Reduced motion: no fill fade-in transition, just instant draw.

**Sigma API used (already available in Sigma 3):**

```ts
sigma.graphToViewport(nodeId: string): { x: number; y: number }
sigma.on("afterRender", handler)
```

**Edge cases:**

- File with 0–2 symbols: skip hull (convex hull of < 3 points is degenerate).
- Canvas resize: `ResizeObserver` already watches the container; call `canvas.width = container.clientWidth` etc. in the existing resize handler.

---

#### B2 — Execution-Flow Highlight (call chain pulse)

**Problem:** selecting a node shows its descendants but all edges look the same — there's no sense of "flow order" or depth.  
**Solution:** the existing BFS (`computeDescendantSelection`) is extended to return edges grouped by hop depth. The framer-motion overlay delays each hop's animation by `hopIndex × 0.18 s` creating a visible waterfall pulse.

**How it fits:**

- Change `computeDescendantSelection` return type to add `hopLayers: string[][]` (array of arrays of edge IDs per BFS depth, max `FLOW_MAX_DEPTH = 4`).
- In the JSX, pass `transition.delay = hopIndex * 0.18` to each `motion.line` based on which layer the edge belongs to.
- No new Sigma API needed — purely a change to the React overlay.
- Traveler circles already exist; add `delay: hopIndex * 0.22` to them too.

```ts
// current return
{ selectedNodeId, nodeIds, edgeIds, orderedEdgeIds }
// new return — backwards compatible
{ selectedNodeId, nodeIds, edgeIds, orderedEdgeIds, hopLayers: string[][] }
```

**Reduced motion:** skip delays and animation entirely — render static highlighted lines (same as current no-motion path).

---

#### B3 — Caller/Callee Sidebar Panel

**Problem:** you can see selected-node edges highlighted on canvas but there's no readable list of "who calls this" or "what does this call."  
**Solution:** when a node is selected, a collapsible panel (right side, same position as existing `dxt-graph-panel`) lists direct callers and callees.

**How it fits:**

- Read `selectedNodeId` (already in React state).
- Call `graph.inNeighbors(selectedNodeId)` filtered to edges with `edgeKind === "CALLS"` for callers; `graph.outNeighbors()` for callees.
- Render as two sections inside the existing `dxt-graph-panel` div (or replace the stats block when a node is selected).
- Each row: symbol name + file badge. Click → `onNavigate(filePath, startLine)` (same callback already used by double-click).
- Cap at 8 entries per section; show "+ N more" if overflow.
- Zero new state — reads directly from `graphRef.current`.

---

#### B4 — Mini-Map

**Problem:** on large graphs the user loses orientation after panning.  
**Solution:** a small 128 × 96 px thumbnail in the bottom-right corner of the graph stage.

**Approach — custom Canvas2D thumbnail (no new dep):**

- A second `<canvas id="dxt-minimap">` sits at `position: absolute; bottom: 14px; right: 14px; z-index: 10; pointer-events: auto`.
- On `afterRender`: iterate `graph.forEachNode()`, project with `graphToViewport()`, scale to 128 × 96, draw dots at 1–2 px each in node color.
- Draw a viewport rectangle using `sigma.getCamera().getState()` (ratio → zoom level → rectangle size).
- Mouse drag on the mini-map calls `camera.setState({ x, y })`.
- Hidden when `graph.order <= 20`.
- A toggle button `⊞` in the top-left toolbar shows/hides it (`useState<boolean>`).

> Note: `@sigma/layer-minimap` npm package is an option if the custom canvas feels flaky. It's < 4 KB and has no native deps. Decide at planning time after checking bundle impact on `.vsix` size.

---

### Implementation order (suggested)

1. **B2 first** — purely internal change to `computeDescendantSelection` + framer-motion delay prop. Zero new DOM, zero new canvas. Smallest blast radius. Tests are easy to write.
2. **B3** — React JSX only, reads existing graph state. No Sigma interaction.
3. **B1** — new canvas element + `afterRender` hook. Medium complexity.
4. **B4** — second canvas + camera interaction. Most complex; also least critical.

### Files that will change

| File                                                           | What changes                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/extension/src/webview/components/GraphView.tsx`      | B1 canvas init, B2 hop layers, B3 panel JSX, B4 minimap canvas |
| `packages/extension/src/webview/html.ts`                       | CSS for cluster canvas, panel layout, minimap                  |
| `packages/extension/src/webview/components/GraphView.test.tsx` | tests for hop layers, sidebar entries, hull grouping           |

No new packages. No new top-level `packages/` workspace entries. No library swaps.

### Open questions before planning

1. B3 panel — replace stats block on selection or stack below? (Stack below keeps stats always visible.)
2. B1 convex hull — inline Graham scan (zero dep) or `convex-hull` npm (< 2 KB, no native)? Preference: inline unless the polygon looks wrong at edge cases.
3. B4 minimap — custom canvas or `@sigma/layer-minimap`? Need to check `.vsix` size budget first.
4. B2 hop depth — cap at 4 or make it user-configurable via a slider in the panel?

---

## Scratch: Graph Edges CALLS ID mismatch + IMPORTS alias resolutionGap

_Branch: 015-release-truth-gate_

### Diagnosis

**Problem 1: CALLS edges written with wrong symbol IDs**

`NaiveCallExtractor.buildSymbolMap()` mints fresh `uuidv4()` IDs for symbols by walking
the AST independently. `BaselineTsJsExtractor` also mints fresh `uuidv4()` IDs for the
same symbols via `extractTypeScriptFromTree`. Both run from the same `input.fileId` but
they **never share the registry does not expose one extractor's outputs to another.IDs**

Result: CALLS edges ARE written to the `edge` table (pipeline is correct), but
`source_id` / `target_id` point to ephemeral IDs that no `symbol` row has. The SQL JOIN
in `getWorkspaceSubgraph` (`INNER JOIN symbol src ON src.id = e.source_id`) returns zero
CALLS edges are invisible in the graph.

**Problem 2: IMPORTS alias resolution returns null for `@/*` imports**

`resolveImportPath()` in `extractor.ts` returns `null` immediately for any specifier that
`src/*` mapping in `tsconfig.json` is never consulted.
Result: all `@/` imports silently dropped.

### Fix Plan

#### Fix A: CALLS share symbol IDs across extractors (minimal change)edges

The `ExtractInput` interface already has `fileId`. We need it to also carry the symbols the
baseline wrote. Two approaches:

**Option A1 ( minimal surface change):**chosen

- Add optional `knownSymbols?: ReadonlyArray<{ id: string; name: string; kind: string; startLine: number }>` to `ExtractInput`.
- After `BaselineTsJsExtractor` runs in the registry, inject `result.symbols` into `input` for subsequent extractors.
- `NaiveCallExtractor` uses `input.knownSymbols` for `resolveTargetId` and `resolveSourceIdFromNode` instead of building its own symbol table.
- Zero schema changes; zero new npm deps.

**Option A2 ( skip NaiveCallExtractor's own symbol map entirely):**alternative

- The registry merges results in order. After baseline runs, pass merged `symbols` back into later `extract()` calls.
- Requires making the registry stateful within a `run()` slightly more invasive.call

#### Fix B: resolve `@/*` path aliasesIMPORTS

- In `extractImportRefs()`, before checking `!specifier.startsWith(".")`, try to load
  `tsconfig.json` from the workspace root and expand path aliases.
- Cache the parsed tsconfig per workspace root (module-level Map) to avoid repeated FS reads.
- Only resolve `paths` mappings; ignore `baseUrl` for now (keep scope small).
- If tsconfig is absent or parse fails, fall back to current behavior (relative-only).

### Implementation Notes

- `knownSymbols` on `ExtractInput` must be `readonly` and optional (backward compat).
- The registry `run()` loop: after each extractor, accumulate `symbols` into a running list,
  inject into the _next_ extractor's input as `knownSymbols`.
- `NaiveCallExtractor.resolveTargetId` already has the right just change source toshape
  `input.knownSymbols` instead of `fileSymbols`.
- `NaiveCallExtractor.resolveSourceIdFromNode`: keep the AST-walk fallback but match against
  `input.knownSymbols` by `startLine` / `startCol` from node position (same heuristic, better IDs).
- For tsconfig alias expansion: use `JSON.parse` only (no `ts.parseJsonConfigFileContent`
  to avoid pulling TypeScript as a runtime dep). Parse `compilerOptions.paths` key.

---

## Option B Re-scratch (Round 2): SQL-side FQN resolution for CALLS edges

**Date**: Current session

### Problem diagnosis

`NaiveCallExtractor.buildSymbolMap()` generates fresh `uuidv4()` IDs for symbols.
These IDs do not match the symbol IDs written by `BaselineTsJsExtractor` (also random uuids).
So CALLS edges land in the `edge` table with `source_id`/`target_id` pointing to IDs that
do not exist in the `symbol` table.

CALLS
never appear in the graph.

### Fix: two- extractor metadata + SQL post-passphase

#### Phase 1: NaiveCallExtractor emits FQNs in metadata

- `sourceId` = `input.fileId` (stable placeholder; not phantom UUID)
- `targetId` = `null` (always; resolved by SQL)
- Metadata gains: `source_fqn = "${relativePath}:${enclosingFunctionName}"` (or just
  `relativePath` for module-scope calls)
- `callee_name` stays (already used for same-file target resolutionpresent)

#### Phase 2: `resolveCallEdgeSymbols` SQL UPDATE in `replaceFileGraph`

Runs inside the same transaction, after symbols + edges are written:

```sql
 actual symbol
UPDATE edge
SET source_id = COALESCE(
  (SELECT s.id FROM symbol s
   WHERE s.file_id = $file_id
     AND s.fqn = json_extract_string(edge.metadata, '$.source_fqn')
   LIMIT 1),
  source_id
)
WHERE kind = 'CALLS'
  AND source_id = $file_id;

 same-file symbol by callee_name
UPDATE edge
SET target_id = COALESCE(
  (SELECT s.id FROM symbol s
   WHERE s.file_id = $file_id
     AND s.name = json_extract_string(edge.metadata, '$.callee_name')
     AND s.kind IN ('function', 'method', 'class')
   LIMIT 1),
  target_id
)
WHERE kind = 'CALLS'
  AND target_id IS NULL
  AND source_id IN (SELECT id FROM symbol WHERE file_id = $file_id);
```

#### Files changed

1. `packages/core/src/extractors/NaiveCallExtractor. simplify; add FQN metadatats`
2. `packages/core/src/storage/repository. add `resolveCallEdgeSymbols`; call after `insertExtraEdges`ts`
3. `packages/core/src/extractors/NaiveCallExtractor.test. update assertionsts`
