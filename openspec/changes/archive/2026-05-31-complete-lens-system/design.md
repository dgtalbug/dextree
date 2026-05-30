# Design — completing the lens system

## Context

A lens today is one pure function:

```ts
type LensSelector = (graph, nodes) => ReadonlySet<string>; // node ids that MATCH
```

The webview node reducer dims every node NOT in the active lens's match set
(alpha 0.35 via `dimColor`), behind the precedence ladder:

```
  trace  >  hover/selection  >  search  >  lens
```

`entry-points` fits this model perfectly. `architecture` does not — and that
mismatch is the only non-trivial decision here.

## Decision 1 — `entry-points` is a plain selector (no new machinery)

```ts
const REAL_ENTRY_KINDS = new Set(["runtime", "handler", "test", "public-api"]);

export function selectEntryPoints(_graph, nodes): ReadonlySet<string> {
  return new Set(
    nodes
      .filter((n) => n.entryKind !== undefined && REAL_ENTRY_KINDS.has(n.entryKind))
      .map((n) => n.id),
  );
}
```

- Reads `GraphNode.entryKind` (already projected — `subgraph.ts`).
- `unclassified` is excluded (it is the "we couldn't decide" sentinel, not an
  entry kind).
- Deterministic: pure filter, no ordering needed (it is a set, not a top-K).
- Drops straight into `LENS_REGISTRY["entry-points"].selector` and the existing
  `lensCounts` / `lensMatchSet` memos. **Zero reducer changes.**

This requires extending the contract's `LensInputNode` to expose `entryKind`
(currently only `id`, `importance`, `fanIn`). Additive, optional field.

## Decision 2 — `architecture` is a colour-mode, not a match-set (THE decision)

`architecture` wants to _recolour every node by its layer_, not dim
non-matches. Three ways to model it:

### Option A — overload `LensSelector` to also return colours

Make the architecture entry carry a second function `(node) => color`. Reducer
checks "is the active lens a colour-lens?" and recolours instead of dimming.

- ✅ Keeps one registry, one active-lens slot.
- ❌ `LensSelector` now has two incompatible shapes; the "lens = match set"
  mental model breaks. Every consumer of `lensMatchSet` must special-case it.

### Option B — a discriminated lens kind (RECOMMENDED)

Tag each lens with a `mode`:

```ts
type LensMode =
  | { kind: "match"; selector: LensSelector } // god-class, most-used, …, entry-points
  | { kind: "recolor"; colorOf: (node) => string }; // architecture
```

Registry entries carry a `mode` instead of a bare `selector`. The reducer
branches once on `mode.kind`:

- `match` → existing dim-non-matches path (unchanged).
- `recolor` → `return { ...data, color: mode.colorOf(node) }` (no dimming, no
  label change).
- `lensCounts` for a `recolor` lens = count of nodes with a known layer.

- ✅ Honest types — each lens declares what it does. No overloaded function.
- ✅ Existing four lenses become `{ kind: "match", selector }` mechanically.
- ✅ Extensible: the future edge-overlay lens is just another `mode.kind`.
- ❌ Slightly more churn in the registry + the one reducer branch.

### Option C — make architecture NOT a lens; a separate "colour by" control

Move it out of the lens rail into its own toggle.

- ✅ Cleanest separation.
- ❌ Contradicts the shipped UI (it is row 5 of the rail, with an icon and a
  slice-021 contract). Users expect it in the rail.

**Choice: Option B.** It is the smallest change that keeps types honest, leaves
the four working lenses untouched in behaviour, and gives the eventual
edge-overlay lens (`mode.kind: "edge-overlay"`) a place to live. Option A's
overloaded selector is the trap that produced the EXTENDS/CONTAINS-style
ambiguity elsewhere; we avoid repeating it.

## Decision 3 — layer → colour mapping lives in `lensColor.ts`

```
  presentation    → var(--vscode-charts-blue)
  application      → var(--vscode-charts-purple)
  domain           → var(--vscode-charts-green)
  infrastructure   → var(--vscode-charts-orange)
  test             → var(--vscode-charts-yellow)
  unknown          → node's base colour (NOT recoloured — honest about "we don't know")
```

- VS Code chart tokens only (CLAUDE.md: no hardcoded hex in webview styles).
- `unknown` nodes keep their base colour rather than getting a "misc" colour —
  consistent with `unclassified` being a real "no signal" state, and it lets
  the user see at a glance how much of the graph is unlayered.
- A small legend (which colour = which layer) should appear in the status bar
  when the architecture lens is active, mirroring the existing
  `lens-status-bar` pill. (Spec requirement; see delta.)

## Precedence interaction

The architecture recolour sits at the SAME rung as lens dimming — lowest
priority. Trace/selection/search still win: if a node is dimmed by trace, it
stays dimmed (we do not recolour it). Concretely, the `recolor` branch only
runs in the same `activeFocus === null && no search` block where lens dimming
runs today. This keeps the ladder intact.

## Risks / open questions

- **Colour accessibility:** five layer colours must stay distinguishable in
  both light and dark themes. Chart tokens are theme-aware, but the palette
  should be eyeballed in both. (Verification task.)
- **`recolor` + the existing "selected node enlarge" branch:** a selected node
  is enlarged before the lens block runs, so selection still reads correctly
  on top of a recoloured graph. Confirm in tests.
- **Contract mirror:** `specs/021-lenses-panel/contracts/lenses.ts` is the
  slice-021 mirror. If we change the registry shape (Option B), that mirror
  drifts. Per its own header ("runtime wins — update this file in the same
  PR"), the implementing PR must update it too. Flag in PR description.
