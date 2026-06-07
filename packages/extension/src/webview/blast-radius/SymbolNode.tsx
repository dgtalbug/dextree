import type React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { FocusedNode } from "./focusedGraphModel.js";
import styles from "./SymbolNode.module.css";

/**
 * Boxed-card custom node for the focused (React Flow) view: the symbol name and a
 * type badge rendered *inside* a box (vs Sigma's point + outside label). Source/
 * target handles let React Flow route edges to the card's edge, not its centre,
 * which is what keeps routed edges from crossing through cards.
 *
 * VS Code CSS variables + codicons only (project rules). The node payload is the
 * pure `FocusedNode` from `focusedGraphModel`.
 */

/** Codicon for a node's kind — symbols by symbolKind, containers by type. */
function codiconFor(node: FocusedNode): string {
  if (node.nodeType === "file") return "symbol-file";
  if (node.nodeType === "folder") return "folder";
  switch (node.symbolKind) {
    case "class":
      return "symbol-class";
    case "interface":
      return "symbol-interface";
    case "method":
      return "symbol-method";
    case "enum":
      return "symbol-enum";
    case "type":
      return "symbol-type-parameter";
    case "variable":
      return "symbol-variable";
    case "function":
      return "symbol-method";
    default:
      return "symbol-misc";
  }
}

/** Human label for the badge — the symbolKind, or the node type for containers. */
function kindLabel(node: FocusedNode): string {
  if (node.nodeType !== "symbol") return node.nodeType;
  return node.symbolKind ?? "symbol";
}

export type SymbolNodeData = FocusedNode;

export function SymbolNode({ data }: NodeProps): React.ReactElement {
  const node = data as unknown as SymbolNodeData;
  const classes = [styles.card];
  if (node.isFocus) classes.push(styles.focus);
  else if (node.isCore) classes.push(styles.core);

  return (
    <div className={classes.join(" ")} data-testid="focused-symbol-node" title={node.label}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <span className={`codicon codicon-${codiconFor(node)} ${styles.icon}`} aria-hidden="true" />
      <span className={styles.label}>{node.label}</span>
      <span className={styles.badge}>{kindLabel(node)}</span>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
}
