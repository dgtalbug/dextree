# Tasks — graphview-lens-v2

Ordered by dependency: pure core selectors first (TDD), then the independent
interaction fixes, then the lens-table UI + wiring + direction-aware edges.
Each group is independently shippable. Keep to the file-domain lanes: core
selectors in `packages/core`, webview wiring in `packages/extension`.

## 1. Core lens selectors (packages/core, pure, TDD)

- [ ] 1.1 Add a fan-out accessor in `lenses.ts`: derive each node's outbound `CALLS` count from the passed graphology `graph` (single source of the fan-out definition); add unit tests for zero-out, single-out, many-out
- [ ] 1.2 Write failing tests for `selectGodFunction` (ranks by fan-out desc, excludes zero-outbound nodes, stable tiebreak by id)
- [ ] 1.3 Implement `selectGodFunction` to pass 1.2
- [ ] 1.4 Write failing tests for `selectDeadCode` (fan-in 0 AND `entryKind` not in {runtime,handler,test,public-api}; uncalled entry-point excluded; uncalled internal included)
- [ ] 1.5 Implement `selectDeadCode` to pass 1.4
- [ ] 1.6 Add a ranked accessor returning `Array<{ nodeId, metric }>` for each match-set lens (god-function, most-used, god-class, least-used, dead-code); assert in tests that the ranked id set equals the existing `Set` selector output so they cannot diverge
- [ ] 1.7 Register `god-function` and `dead-code` in `LENS_IDS` / `LENS_REGISTRY` metadata (title, description, icon); update lens-count derivation

## 2. GraphView interaction fixes (packages/extension, independently shippable)

- [ ] 2.1 Layout camera-fit: after a layout preset returns `applied` in `handleSelectLayoutPreset`, re-fit the camera using the existing `handleZoomFit` bounds math (extract a shared helper if needed); apply to Circular as well as Hierarchical
- [ ] 2.2 Test: applying Hierarchical/Circular re-fits the camera so node bounds fall within the framed viewport (assert camera target derived from node bounds, not left at the prior FA2 framing)
- [ ] 2.3 Search-result navigation: change `handleSearchSelectResult` to call `selectNode` (highlight + Inspector) + a camera fly-to with a perceptible zoom + `onNavigate(filePath, startLine)` to open the file
- [ ] 2.4 Test: selecting a search result selects the node, opens its file at its line, and degrades safely when the node lacks `x`/`y` (still selects + opens, no throw)
- [ ] 2.5 Update the existing search-result test that asserted camera-only behaviour to the new select+navigate contract
- [ ] 2.6 Move `EdgeTypesPanel` JSX from the right-rail block to beneath `NodeFilterPanel` in the left-rail block; props/handlers unchanged
- [ ] 2.7 Test/snapshot: both node-type and edge-type panels render in the left rail, edge-types below node-types

## 3. Lens result table + emphasis wiring (packages/extension)

- [ ] 3.1 Create a presentational lens result-table component (CSS Modules, VS Code variables, Codicons): renders ranked rows (name + metric), emits a select-row event; no graph access
- [ ] 3.2 Render the table in the Lenses rail only while a lens is active; feed it the ranked accessor output (memoised per graph + active lens)
- [ ] 3.3 Wire row selection to the existing `selectNode` path + a camera fly-to (reuse the search-navigation fly-to); the full graph stays visible (no hiding)
- [ ] 3.4 Direction-aware `CALLS` emphasis in the edge reducer: for the emphasised node, render inbound `CALLS` (callers) distinctly from outbound `CALLS` (callees), dotted/emphasised, using VS Code chart tokens; gate inside the existing precedence ladder
- [ ] 3.5 Test: god-function row selection emphasises outbound edges; most-used row selection emphasises inbound edges; trace dimming still wins over lens emphasis
- [ ] 3.6 Test: activating a lens shows the ranked table; deactivating removes it and restores base graph treatment

## 4. Verification

- [ ] 4.1 `pnpm test` green for touched packages (core + extension); coverage ≥ 70% on touched files
- [ ] 4.2 `pnpm lint` and `pnpm typecheck` zero warnings across core + extension
- [ ] 4.3 Manual check in the running extension: Hierarchical layout renders (not blank); search-result click selects + opens file; god-function/dead-code lenses list matches; edge-types panel is under node-types
- [ ] 4.4 Confirm no out-of-scope §3.5b items (empty-state, depth affordance, Inspector implements, flow lens, architecture default-visibility) were pulled in
