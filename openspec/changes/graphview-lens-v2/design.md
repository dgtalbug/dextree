## Context

The GraphView renders a Sigma.js + graphology graph of the indexed codebase.
Lens selectors are pure functions in `packages/core/src/query/lenses.ts`
(`selectGodClass`, `selectMostUsed`, `selectLeastUsed`, `selectEntryPoints`,
plus the architecture recolour helpers); the webview consumes them through
`LensesPanel.tsx` and applies the result inside the `GraphView.tsx` node/edge
reducers. Today a lens returns a `Set<nodeId>` and the node reducer dims
everything outside that set — there is no per-match detail and no ranking.

Three interaction defects compound the "lenses feel vague" problem:

- `handleSelectLayoutPreset` refreshes Sigma after a layout applies but never
  re-fits the camera; `assignHierarchicalPositions` writes origin-centred
  coordinates over a large range, so the camera (left where ForceAtlas2 put it)
  frames empty space.
- `handleSearchSelectResult` only pans the camera at the current zoom ratio and
  skips both `selectNode` (highlight + Inspector) and `navigateToNode` (open
  file), so a click appears to do nothing.
- `EdgeTypesPanel` lives in the right rail while `NodeFilterPanel` lives in the
  left rail.

Constraints (CLAUDE.md / .dextree/rules.md): TypeScript strict, no `any`
without justification; Sigma.js + graphology only for the main graph; React +
CSS Modules + VS Code CSS variables + Codicons; lens selectors stay pure in
`packages/core` (no VS Code deps); vitest with co-located tests; eslint/prettier
zero-warnings; no inline spec-tracking comment tags.

## Goals / Non-Goals

**Goals:**

- Turn each lens into an explanatory surface: a ranked result table plus
  selected-row emphasis, with the full graph kept visible.
- Add a `god-function` lens (fan-out / orchestrator) and a `dead-code` lens
  (uncalled non-entry symbols).
- Make inbound vs outbound `CALLS` edges visually distinct when a node is
  emphasised.
- Fix the three interaction defects (layout camera-fit, search-result
  navigation, edge-panel placement).

**Non-Goals:**

- No full isolation / hiding of non-matched nodes (explicit product decision —
  "table + keep full graph").
- No new persisted columns or schema migration — `fanOut` is derived at runtime.
- No per-lens colour heatmap, no architecture-in-lens Mermaid rendering (the
  one-level Mermaid diagram stays a separate export action).
- Out of scope entirely (§3.5b carry-forward): empty-graph affordance,
  architecture default visibility / classifier coverage, depth-disabled
  affordance, Inspector `implements` wiring + "+N more", flow lens.

## Decisions

### D1 — Compute `fanOut` client-side, not as a persisted column

The `god-function` lens ranks by outbound `CALLS` count. Only `fanIn` is stored
today (`subgraph.ts` projects `s.fan_in`). Rather than add a `fan_out` column +
migration + recompute pass, derive fan-out in the webview from the in-memory
graphology graph (`forEachOutboundEdge`, filtered to `edgeKind === "CALLS"`).

- **Why:** the graph is already fully loaded in the webview; fan-out is a cheap
  O(edges) pass; avoiding a migration keeps the change additive and reversible.
- **Alternative considered:** a `fan_out` column populated alongside `fan_in` in
  `recomputeGraphHealth`. Rejected for v1 — more surface area (schema version,
  migration, repository writes) for a value that is trivially derivable. Can be
  promoted to a column later if a non-webview consumer (CLI/MCP) needs it.
- **Selector shape:** keep `lenses.ts` selectors pure. Either extend
  `LensInputNode` with an optional `fanOut` the webview fills before calling the
  selector, or pass the already-materialised graphology graph (selectors already
  receive `graph` as their first arg — `selectLeastUsed` uses it). Prefer
  reading outbound degree from the passed `graph` so core stays the single
  source of the fan-out definition.

### D2 — Lens result table is a new rail component; selection drives emphasis

A new presentational table component renders the active lens's ranked matches
(name + metric). It is fed a ranked list the lens layer produces and emits a
"select row" event that the GraphView wires to the same `selectNode` path the
canvas click uses, plus the camera fly-to. The table augments — it never hides.

- **Why:** keeps the table dumb/testable and reuses the existing selection
  machinery (`selectNode`, `selectionRef`, Inspector) instead of inventing a
  parallel highlight path.
- **Alternative considered:** full isolation (hide non-matches on select).
  Rejected per the product decision — keeps surrounding context visible.
- **Ranking:** selectors currently return an unordered `Set`. Add a parallel
  "ranked" accessor (ordered `Array<{ nodeId, metric }>`) for the table while
  preserving the `Set` return for the existing dimming path, so nothing
  downstream of the current contract breaks.

### D3 — Direction-aware `CALLS` emphasis lives in the edge reducer

When a node is emphasised, the edge reducer compares each `CALLS` edge's
relationship to the emphasised node: inbound (target === node) vs outbound
(source === node), and renders them with distinct, dotted/emphasised styling.
This folds in the standalone "called-by vs calls colours" backlog gap.

- **Why:** the edge reducer already runs per-frame and already has the selected
  node id via refs; this is the natural seam.
- **Precedence:** must sit inside the existing ladder (trace > hover/selection >
  search > lens) and never override a higher-precedence treatment — the spec
  pins this with a "trace dimming still wins" scenario.
- **Colours:** VS Code chart tokens via the existing theme-colour resolver — no
  hardcoded hex (rules.md).

### D4 — Interaction fixes reuse existing helpers

- **Layout camera-fit:** call the existing `handleZoomFit` bounds-computation
  after a preset `applied` result (and after Circular, which has the same latent
  issue). Reuse, don't duplicate, the fit math.
- **Search-result navigation:** `handleSearchSelectResult` calls `selectNode`
  (highlight + Inspector) + a camera fly-to **with a zoom** + `onNavigate`
  (open file). The first two already exist; only the wiring is new.
- **Edge-panel move:** relocate `EdgeTypesPanel` JSX from the right-rail block to
  beneath `NodeFilterPanel` in the left-rail block. Pure layout move; the
  panel's props/handlers are unchanged.

## Risks / Trade-offs

- **[Fan-out recomputed every render]** → It is O(edges) over an already-loaded
  graph; memoise per graph identity (same pattern as the existing
  `searchResults`/`matchedNodeIds` `useMemo`s) so it runs once per graph change,
  not per frame.
- **[Camera fly-to "zoom" feels jarring on large graphs]** → Tune the target
  ratio conservatively; reuse the fit math's padding so the framing matches the
  existing Fit button users already know.
- **[Edge emphasis competes with trace/search dimming]** → Pinned by spec
  precedence scenarios; the reducer change must be inside the existing no-focus
  branch, mirroring how lens dimming is already gated.
- **[Ranked accessor diverges from the Set selector]** → Derive the `Set` from
  the ranked list (or vice-versa) in one place so they cannot disagree; cover
  with a unit test asserting the set equals the ranked ids.
- **[Dead-code false positives from naive pass-1 CALLS]** → Pass-1 `CALLS` is
  heuristic, so some "dead" symbols may actually be called dynamically. Acceptable
  for v1; LSP pass-2 (S8) will tighten this. The lens is a hint, not a guarantee.

## Migration Plan

No data migration. All changes are code-only and additive:

1. Land core selectors (`selectGodFunction`, `selectDeadCode`, ranked
   accessors) with unit tests — pure, no UI.
2. Land the interaction fixes (camera-fit, search navigation, edge-panel move) —
   independently shippable; each is a small, isolated reducer/handler/JSX change.
3. Land the lens result-table component + GraphView wiring + direction-aware
   edge emphasis.

Rollback is per-commit; nothing persists. No feature flag needed — the new
lenses are additive registry entries and the table only appears when a lens is
active.

## Open Questions

- **Selector fan-out source:** read outbound degree from the passed `graph`
  inside `lenses.ts` (preferred — core owns the definition) vs. precompute
  `fanOut` in the webview and pass it on `LensInputNode`. Resolve during
  implementation; both keep core pure.
- **Table placement:** inside the existing `LensesPanel` (expands when a lens is
  active) vs. a sibling panel below it. Lean toward in-panel expansion to avoid
  a third rail section. Confirm against the mockup during apply.
