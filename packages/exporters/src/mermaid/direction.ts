import type { MermaidScope } from "./scopedSerializer.js";

/**
 * Default flow direction for a Mermaid scope when the user picks `auto`.
 *
 * Symbol caller / callee scopes read as call chains and use `LR`. Everything
 * else (workspace + file scopes today) reads as a hierarchy or folder shape
 * and uses `TB`. Pure: same `scope.kind` always returns the same direction.
 */
export function inferMermaidDirection(scope: MermaidScope): "TB" | "LR" | "BT" | "RL" {
  if (scope.kind === "symbol-callers" || scope.kind === "symbol-callees") {
    return "LR";
  }
  return "TB";
}
