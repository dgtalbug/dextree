# Tasks — complete the lens system

Dependency-ordered. Core first (pure, testable), then registry/types, then the
webview reducer + colour, then UI cleanup, then verification.

## 1. Core selector + colour data

- [x] 1.1 Extend `LensInputNode` (`packages/core/src/query/lenses.ts`) with
      optional `entryKind?: EntryKind` and `archLayer?: ArchitecturalLayer`.
- [x] 1.2 Add `selectEntryPoints(graph, nodes)` — matches `runtime | handler |
test | public-api`, excludes `unclassified`/absent. Pure, returns a new
      `Set`.
- [x] 1.3 Add a `LAYER_FOR_COLOR` ordering / list of real layers (exclude
      `unknown`) for the architecture mode count.
- [x] 1.4 Tests: `selectEntryPoints` (matches/excludes, determinism, empty
      input); layer list completeness. Co-located in `lenses.test.ts`.

## 2. Lens mode typing (Decision B)

- [x] 2.1 Introduce the `LensMode` discriminated union
      (`{kind:"match"; selector}` | `{kind:"recolor"; colorOf}`) where the
      registry descriptor lives (`LensesPanel.tsx`).
- [x] 2.2 Convert the four match lenses to `{kind:"match", selector}` and
      `architecture` to `{kind:"recolor", colorOf}`. Wire `entry-points` to
      `selectEntryPoints`.
- [x] 2.3 Update `lensCounts` / `lensMatchSet` memos in `GraphView.tsx` to read
      `mode` — `match` lenses count their set; the `recolor` lens counts
      known-layer nodes; `lensMatchSet` is `null` for a `recolor` lens.

## 3. Layer colour mapping

- [x] 3.1 Add `layerColor(archLayer)` to `lensColor.ts` mapping the five real
      layers to `--vscode-charts-*` tokens; `unknown` → return null/base.
      No hardcoded hex.
- [x] 3.2 Test `layerColor` returns a token per real layer and base for
      `unknown`.

## 4. Node reducer — recolour branch

- [x] 4.1 In the `GraphView` node reducer, inside the existing
      `activeFocus === null` (no search) block, add: if the active lens is a
      `recolor` lens, return `{...data, color: colorOf(node) ?? data.color}`
      (no `label:""`, no dimming). Leave the `match` lens dim branch as-is.
- [x] 4.2 Sync the active recolour fn into a ref (same ref+refresh pattern as
      `lensMatchSetRef`) so the once-registered reducer reads current state.
- [x] 4.3 Test (reducer-level): trace-active + architecture-active → off-path
      node dimmed, not recoloured (precedence preserved); selected node still
      enlarges over a recoloured graph.

## 5. UI cleanup + legend

- [x] 5.1 Remove `disabledTooltip` and the disabled rendering for
      `entry-points` and `architecture` rows.
- [x] 5.2 Add the layer legend to the lens status bar when the architecture
      lens is active (mirror existing `lens-status-bar` pill markup).
- [x] 5.3 Update `LensesPanel.test.tsx` — both rows now enabled/clickable, no
      "slice 026" tooltip; legend appears for architecture.

## 6. Contract mirror + verification

- [x] 6.1 Update `specs/021-lenses-panel/contracts/lenses.ts` to reflect the
      `LensMode` registry shape (its header mandates same-PR sync). Flag in PR.
- [x] 6.2 Run extension webview tests from `packages/extension` (not filtered
      from root — turbo cache hides real runs). Confirm green, not "FULL TURBO".
- [ ] 6.3 Manual: with an indexed workspace + GraphView mounted, verify
      entry-points dims correctly and architecture recolours; eyeball the five
      layer colours in BOTH light and dark themes for distinguishability.
- [x] 6.4 Coverage ≥ 70% on touched files; eslint/prettier zero warnings.

## Sequencing note

This change is verifiable ONLY once the slice-033 shell mounts GraphView (so a
graph is visible). If 033 is not yet landed, tasks 1–3 (pure core + colour) can
proceed and be unit-tested, but tasks 4–6 manual verification must wait for the
shell.
