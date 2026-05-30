# GraphView lens-v2 + interaction bug fixes

## Why

Two problems block the GraphView from being trustworthy day-to-day, and both
sit in front of the planned S8 (Hello LSP) work — LSP enrichment makes the
lenses _more_ valuable, so the lens UX and the broken interactions should be
right first.

1. **Lenses feel vague.** The five lenses only dim non-matching nodes slightly
   on the full graph (`packages/core/src/query/lenses.ts` selectors →
   `GraphView.tsx` node reducer). There is no list of _what_ matched or its
   metric value, and no lens answers the headline question users actually ask:
   _"which function calls the most others — the orchestrator / API / connector?"_
2. **Three interactions are broken or misplaced.** Hierarchical layout renders
   an empty page; clicking a search result does nothing visible; the edge-types
   filter lives in a different rail from the node-types filter.

The data and existing selectors all work — these are UX/feature gaps, not data
gaps. No re-indexing, schema migration, or new graph data is required.

## What Changes

**Lens system v2 (headline):**

- Reframe lenses from "dim non-matches" to **a ranked table of matches in the
  rail + emphasis on the selected match, with the full graph kept visible**
  (not full isolation/hiding). Selecting a table row flies the camera to that
  node, brightens it, and draws its direction-relevant `CALLS` edges dotted.
- **NEW `god-function` lens** — ranks by fan-OUT (callee count): the function
  that calls the most others (orchestrator / API / connector). Emphasises its
  OUTBOUND `CALLS` edges.
- **NEW `dead-code` lens** — symbols with fan-in `0` that are NOT entry-points
  (`entryKind` of `runtime | handler | test | public-api` excluded). The
  "safe to delete" set.
- **KEEP** `god-class` (PageRank), `most-used` (fan-in), `least-used`
  (fan-in ≤ 1 in main component), `architecture` (recolour by `archLayer`).
- **Direction-aware edge emphasis** — when a lens row (or a node) is selected,
  inbound vs outbound `CALLS` render distinctly (folds in the "called-by vs
  calls colours" gap).
- `fanOut` is **computed client-side** from the in-memory graphology graph
  (`forEachOutboundEdge`) — no schema change, no migration.

**GraphView interaction bug fixes:**

- **Hierarchical/Circular layout re-fits the camera** after a preset applies
  (today `handleSelectLayoutPreset` refreshes Sigma but never re-fits, so the
  origin-centred coordinates land off-screen → blank canvas).
- **Search-result click navigates** — selects the node (highlight + Inspector),
  flies the camera with a zoom, AND opens the file at its line (today it only
  pans the camera at the current ratio, so nothing visible happens).
- **Edge-types panel moves** from the right rail into the left rail beneath the
  node-types panel, so node-types and edge-types sit together.

## Capabilities

### New Capabilities

- `graphview-interaction`: GraphView canvas/rail interaction behaviour —
  layout-preset camera framing, search-result navigation (select + fly + open
  file), and left/right rail panel placement.

### Modified Capabilities

- `lenses`: lens behaviour changes from dim-only to ranked-table + selected-row
  emphasis; two new lenses (`god-function`, `dead-code`) are added; a
  client-side `fanOut` metric and direction-aware `CALLS` edge emphasis are
  introduced. `architecture` recolour and the precedence ladder are unchanged.

## Impact

- **Affected specs:** `lenses` (modified delta), `graphview-interaction` (new).
- **Affected code:**
  - `packages/core/src/query/lenses.ts` — add `selectGodFunction` (fan-out) and
    `selectDeadCode` (fan-in 0, exclude entry-points) pure selectors; a
    `fanOut` helper input on `LensInputNode` (or a graph-derived helper).
  - `packages/extension/src/webview/components/LensesPanel.tsx` +
    a new lens result-table component — render the active lens's ranked matches,
    click-to-select-and-fly.
  - `packages/extension/src/webview/components/GraphView.tsx` —
    `handleSelectLayoutPreset` re-fits the camera on apply;
    `handleSearchSelectResult` selects + flies + navigates; direction-aware
    `CALLS` emphasis in the edge reducer; client-side `fanOut` computation.
  - GraphView left/right rail JSX — move `EdgeTypesPanel` under
    `NodeFilterPanel`.
- **Out of scope (deferred to §3.5b carry-forward):** empty-graph affordance,
  architecture default-visibility / classifier-coverage investigation,
  depth-disabled affordance, Inspector `implements` wiring + "+N more", and the
  flow lens (entry-point → leaves BFS). The Mermaid granularity-floor fix is a
  separate change. S8 Hello LSP comes after this.
- **Risk:** low. Lens selectors are additive + pure (TDD'd). The interaction
  fixes reuse existing helpers (`handleZoomFit`, `selectNode`, `navigateToNode`).
  No new dependencies; no schema or graph-data change.
