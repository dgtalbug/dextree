import type React from "react";
import { lazy, Suspense } from "react";

import type { FocusedGraphViewProps } from "./FocusedGraphView.js";

/**
 * Lazy entry point for the focused view. `@xyflow/react` (and its CSS) is heavy
 * and only needed once a user focuses a node, so the whole `FocusedGraphView`
 * module — the sole importer of React Flow — is code-split behind `React.lazy`
 * and kept out of the initial graph bundle.
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
