# Complete the lens system — enable entry-points + architecture lenses

## Why

The Lenses rail ships five lenses. Three work (`god-class`, `most-used`,
`least-used`). Two are disabled stubs (`entry-points`, `architecture`) whose
tooltip reads _"Available after slice 026 — entry-point and architectural
layer classification."_

That blocker no longer exists. The classification it waited on has fully
landed:

- `classifySymbol()` computes `entryKind` + `archLayer` and is wired into the
  indexer (`packages/core/src/index.ts`).
- Migrations 006/007 persist `symbol.entry_kind` and `symbol.arch_layer`
  (schema v7).
- The subgraph projection already surfaces both on every node
  (`GraphNode.entryKind`, `GraphNode.archLayer` — `packages/core/src/types.ts`).

So every node arriving in the webview already carries the data these two
lenses need. The lenses are dark only because their selectors were left as
`null` and the tooltip was never updated. This change finishes the wiring.

## What changes

- **`entry-points` lens** — a standard match-set selector (same shape as the
  three working lenses): highlight every symbol whose `entryKind` is a real
  classification (`runtime | handler | test | public-api`), dimming the rest.
- **`architecture` lens** — a NEW lens _mode_. Unlike every existing lens, it
  does not dim non-matches; it **recolours each node by its `archLayer`**
  (presentation / application / domain / infrastructure / test). This does not
  fit the current `LensSelector → Set<id>` contract and is the one real design
  decision in this change (see `design.md`).
- **Remove the stale "slice 026" tooltips** and the disabled state from both
  rows once their selectors/modes exist.
- **Lens counts** for `entry-points` reflect classified-symbol count;
  `architecture` shows total classified (non-`unknown`) node count.

## Non-goals

- The UI bugs (depth / trace / mermaid / GraphView not opening). Those are
  slice-033 shell completion + the host `ready`/`canHydrateCache` handshake —
  a separate, unrelated change. A lens fix cannot even be _seen_ until the
  shell mounts, so 033 should land first.
- The edge-kind A/B mismatch cleanup (`EXTENDS`/`CONTAINS` phantoms). Separate
  change; it touches the `GraphEdgeKind` contract.
- Generalizing lenses to edge-overlays. A larger future change; this one stays
  within the node-overlay model (plus the colour-mode extension below).
- Re-classification accuracy / new heuristics in `classifySymbol`. We consume
  the classification as-is.

## Impact

- **Affected specs:** `lenses` (delta below).
- **Affected code (LENS lane):**
  - `packages/core/src/query/lenses.ts` — add `selectEntryPoints`; add the
    `archLayer`-bucketing helper for the architecture mode.
  - `packages/extension/src/webview/components/LensesPanel.tsx` — un-stub both
    rows, drop the disabled tooltips.
  - `packages/extension/src/webview/components/GraphView.tsx` — teach the node
    reducer the architecture colour-mode branch.
  - `packages/extension/src/webview/components/lensColor.ts` — add per-layer
    colour mapping (VS Code chart tokens, no hardcoded hex).
- **Risk:** low. Additive. The three existing lenses and the precedence ladder
  (trace > focus > search > lens) are untouched.
- **LOC estimate:** well under the ~400 net cap; single PR.
