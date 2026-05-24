# Spec 016 — Graph Cluster + Flow View (Option B)

**Status:** Draft — not yet planned or tasked.  
**Prerequisite:** Spec 014 (graph visual polish, Option A) must be on `main` first.

---

## 1. Problem

The current GraphView renders a flat cloud of nodes. As codebases grow, two things get hard:

1. **Where does a file's code live?** Symbols from the same file scatter across the canvas with no grouping cue. Developers cannot quickly identify which cluster of dots belongs to which file.
2. **Why is this symbol called?** Finding the call path from an entry point to a target function requires mentally tracing edges. There is no "trace this flow" affordance.

GitNexus exposes execution-flow data through its MCP graph (57 flows indexed in Dextree's own repo). Dextree already has this data; it just doesn't surface it visually.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | File nodes visually anchor their symbols — users see which symbols live in which file without reading labels. |
| G2 | Users can highlight a call chain (execution flow) by selecting a node. |
| G3 | A caller/callee panel surfaces the immediate neighbourhood of the selected node as a readable list. |
| G4 | A mini-map provides orientation when the graph is large (> 40 nodes). |
| G5 | Reduced-motion preference is respected; all new animations are behind `prefers-reduced-motion`. |

---

## 3. Non-Goals

- Replacing Sigma.js with another renderer (locked to Sigma + graphology).
- 3D layout.
- Per-user cluster customisation.
- Replacing the Alfred opt-in LLM flow.

---

## 4. Feature Descriptions

### 4.1 Convex Hull Cluster Blobs (G1)

A Canvas2D layer sits behind the Sigma WebGL canvas. On every camera-change event (`sigma.on("afterRender")`), it redraws translucent convex-hull polygons — one per file node — enclosing all symbols that belong to that file (matched by `filePath`).

**Visual spec:**
- Hull fill: `color-mix(in srgb, <file-node-color> 8%, transparent)` — very faint.
- Hull stroke: `color-mix(in srgb, <file-node-color> 28%, transparent)`, 1.5px, dashed `4 6`.
- File-node label is rendered **outside** the hull boundary at the top-left (Canvas2D text, same font as Sigma labels).
- Hulls are hidden when fewer than 3 symbols belong to a file (a hull of 1–2 points is meaningless).
- If `prefers-reduced-motion` is set, hulls appear instantly; otherwise they fade in over 250 ms on first render.

**Implementation notes:**
- The Canvas2D layer (`<canvas id="dxt-cluster-layer">`) is inserted as a sibling of Sigma's canvas, positioned with `position: absolute; inset: 0` and `pointer-events: none`.
- Sigma's `graphToViewport()` method converts graph coordinates to screen coordinates; the cluster layer calls this on every camera update.
- Graham scan or a simple convex-hull library (e.g., `convex-hull` npm package — < 2 KB, no native deps) computes the polygon.
- On node-hover/selection, the hovered file's hull brightens (fill to 14%, stroke to 50%); others dim to 40% of their base opacity.

### 4.2 Execution-Flow Highlight (G2)

When a node is selected (single-click), the view traces all outgoing CALLS/DEFINES paths depth-first up to 4 hops and renders them as an animated pulse chain in the SVG overlay (reusing the existing `dxt-selection-overlay` mechanism).

**Visual spec:**
- Pulse colour: `baseColor` of the first edge in the chain.
- Each hop is rendered as a dashed animated line (existing `dxt-selection-path` style) with a 0.18 s delay per hop, giving a waterfall effect.
- Traveler circles (existing `dxt-selection-traveler`) move along each edge.
- Non-chain nodes and edges fade to `FADE_ALPHA = 0.06` (same as current selection behaviour).
- When `prefers-reduced-motion` is active, pulse animation is removed; the chain edges are drawn as static highlighted lines.

**Implementation notes:**
- The existing `computeDescendantSelection` BFS (in `GraphView.tsx`) is extended to return ordered hop layers (array of arrays of edge IDs), enabling the per-hop animation delay.
- Max depth: 4 hops (configurable constant `FLOW_MAX_DEPTH = 4`).
- The overlay SVG passes `transition.delay` via framer-motion based on hop index.

### 4.3 Caller/Callee Sidebar Panel (G3)

A collapsible panel (right side, overlaid on the graph) lists the selected node's immediate callers and callees. It replaces/extends the existing `dxt-graph-panel` stats panel.

**Visual spec:**
- Panel width: `min(240px, 30%)` (same as current `dxt-graph-panel`).
- Two sections: **Called by** (incoming CALLS) and **Calls** (outgoing CALLS), each with up to 8 entries.
- Each entry: symbol name + file badge. Clicking navigates to that symbol (`onNavigate`).
- Empty sections are hidden.
- Panel is hidden when no node is selected.

**Implementation notes:**
- No new state needed: panel reads `selectedNodeId` and calls `graph.neighbors()` filtered by edge kind.
- Rendered as React JSX in the same `GraphView` component.
- Must not depend on any external data source; only the in-memory graphology graph.

### 4.4 Mini-Map (G4)

A `<canvas>` thumbnail (128 × 96 px) in the bottom-right of the graph stage shows the full graph at reduced scale with a viewport rectangle indicating the current camera position.

**Implementation approach options (pick one at plan time):**
- **A (preferred):** `@sigma/layer-minimap` — official Sigma plugin, < 4 KB.
- **B (fallback):** Roll a 128 × 96 Canvas2D thumbnail that re-renders on `afterRender` event.

**Behaviour:**
- Dragging the viewport rect in the mini-map pans the main camera.
- Hidden when the graph has ≤ 20 nodes (small graphs don't need orientation help).
- Toggled by a `⊞` button in the top-right toolbar.

---

## 5. Data Model

No new graph schema is required. All features operate on the existing `MultiDirectedGraph` in memory using node `filePath`, `nodeKind`, and edge `edgeKind` attributes.

---

## 6. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC1 | For a graph with ≥ 2 files each containing ≥ 3 symbols, convex hull blobs are visible behind the symbol nodes. |
| AC2 | Selecting a function node highlights its call chain up to 4 hops with animated overlay. |
| AC3 | The caller/callee panel lists at least one caller or callee for a connected node. |
| AC4 | With `prefers-reduced-motion: reduce`, all animations are suppressed; hulls and chains render statically. |
| AC5 | Mini-map is visible for a graph with > 20 nodes; hidden for ≤ 20 nodes. |
| AC6 | Existing tests pass unchanged; new code has ≥ 70% coverage. |

---

## 7. Implementation Constraints

- No new top-level packages.
- All new code lives in `packages/extension/src/webview/`.
- `convex-hull` npm package (if used) goes into `packages/extension` devDependencies and is verified to have no native addon.
- The Canvas2D cluster layer must be created via `document.createElement("canvas")`, **not** via React state, to avoid reconciler overhead on every camera tick.
- Sigma's `graphToViewport()` is the only approved coordinate-mapping API. Do not reimplement coordinate math manually.
- CSS for the new elements goes in `packages/extension/src/webview/html.ts` (no `.css` files, no Tailwind).

---

## 8. Open Questions (resolve at planning)

1. Use `@sigma/layer-minimap` (saves ~1 day) or roll a custom thumbnail? → Check bundle size impact on the `.vsix`.
2. Convex hull library (`convex-hull` on npm) or inline a 50-line Graham scan? → Prefer zero-dep if the implementation is simple.
3. Should the sidebar replace the existing legend/stats panel or stack below it?
4. Should execution-flow highlight work for DEFINES edges (file→symbol) as well, or only CALLS?

---

*Document created: Option B design — cluster + flow view.*
