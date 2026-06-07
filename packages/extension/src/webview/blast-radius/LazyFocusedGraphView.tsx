import type React from "react";
import { lazy, Suspense } from "react";

import type { FocusedGraphViewProps } from "./FocusedGraphView.js";

/**
 * Lazy entry point for the focused view. `FocusedGraphView` (the sole importer of
 * `@xyflow/react`) is loaded via `React.lazy` so the React Flow component tree is
 * only constructed when a user actually focuses a node.
 *
 * NOTE: the webview is built as a single IIFE (`vite lib`, `formats: ["iife"]`),
 * which cannot emit dynamic-import chunks — so this does NOT keep React Flow out
 * of the bundle (it ships in the one webview.js regardless). The deferral is of
 * render/construction work, not bytes. Kept because it is correct, costs nothing,
 * and becomes a real code-split if the webview build ever moves to multi-chunk.
 */
const FocusedGraphViewInner = lazy(() =>
  import("./FocusedGraphView.js").then((m) => ({ default: m.FocusedGraphView })),
);

export function LazyFocusedGraphView(props: FocusedGraphViewProps): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <FocusedGraphViewInner {...props} />
    </Suspense>
  );
}
