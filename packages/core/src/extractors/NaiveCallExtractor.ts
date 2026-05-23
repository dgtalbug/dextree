import { relative, sep } from "node:path";
import { v4 as uuidv4 } from "uuid";

import type { Node } from "web-tree-sitter";

import type { EdgeRow, Extractor, ExtractInput, ExtractionResult } from "./types.js";

/**
 * Node types that represent a named callable or class scope — used to find
 * the enclosing function name when computing `source_fqn` for CALLS edges.
 * Subset of `NAMED_SCOPE_TYPES`; only types that carry a meaningful call-source name.
 */
const CALLABLE_SCOPE_TYPES = new Set([
  "function_declaration",
  "class_declaration",
  "method_definition",
]);

/** TS/JS languages this extractor runs on — must match BaselineTsJsExtractor. */
const SUPPORTED = new Set(["typescript", "javascript", "typescriptreact", "javascriptreact"]);

function emptyResult(): ExtractionResult {
  return {
    file: null,
    symbols: [],
    imports: [],
    edges: [],
    annotations: [],
    modules: [],
    tests: [],
  };
}

function toPosixRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

/**
 * Extract the callee identifier text from a `call_expression` node.
 * For `foo()` → "foo"; for `x.foo()` → "foo".
 */
function extractCalleeName(callNode: Node): string | null {
  const fnChild = callNode.childForFieldName("function");
  if (!fnChild) return null;

  if (fnChild.type === "identifier") {
    return fnChild.text;
  }

  // member_expression: x.foo() — callee is the property (right-hand identifier)
  if (fnChild.type === "member_expression") {
    const propChild = fnChild.childForFieldName("property");
    if (propChild?.type === "property_identifier" || propChild?.type === "identifier") {
      return propChild.text;
    }
  }

  return null;
}

/**
 * Recursively collect all `call_expression` descendant nodes of `root`,
 * returned in source order.
 */
function collectCallExpressions(root: Node): Node[] {
  const results: Node[] = [];
  function walk(node: Node): void {
    if (node.type === "call_expression") results.push(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  walk(root);
  return results;
}

/**
 * Walk up the AST from `callNode` to find the name of the nearest enclosing
 * callable scope (function, method, or class). Returns
 * `"${relativePath}:${name}"` when a scope is found, or just `relativePath`
 * for module-scope calls.
 *
 * This FQN is written into edge metadata as `source_fqn` so that
 * `resolveCallEdgeSymbols` in `repository.ts` can SQL-JOIN it against
 * `symbol.fqn` after BaselineTsJsExtractor has written the real symbol rows.
 */
function resolveSourceFqn(callNode: Node, relativePath: string): string {
  let candidate: Node | null = callNode.parent;
  while (candidate !== null) {
    if (candidate.parent === null) break; // reached source_file root

    if (CALLABLE_SCOPE_TYPES.has(candidate.type)) {
      const nameNode =
        candidate.childForFieldName("name") ??
        candidate.children.find(
          (c) => c.type === "identifier" || c.type === "property_identifier",
        ) ??
        null;
      if (nameNode) return `${relativePath}:${nameNode.text}`;
    }
    candidate = candidate.parent;
  }
  return relativePath;
}

/**
 * Pass-1 naive CALLS extractor. Walks tree-sitter `call_expression` nodes and
 * emits one `CALLS` edge per call site.
 *
 * **ID strategy (post-fix):** `source_id` and `target_id` are left as
 * placeholder/null values here. The real symbol IDs are resolved by the SQL
 * post-pass `resolveCallEdgeSymbols` in `repository.ts` after all symbol rows
 * for this file have been written. This avoids the mismatch between the random
 * UUIDs this extractor would otherwise mint and the IDs BaselineTsJsExtractor
 * writes.
 *
 * Edge metadata carries:
 *   - `source_fqn`  — `"${relativePath}:${enclosingFn}"` (or just relativePath
 *                     for module-scope calls); used for source_id resolution.
 *   - `callee_name` — raw identifier of the called symbol; used for
 *                     same-file target_id resolution.
 *   - `call_site_range`, `language` — informational.
 *
 * Cross-file / indirect / unresolved callees remain `target_id = null` after
 * the post-pass. Pass-2 LSP (S8) will fill those in.
 *
 * Emits only `edges`; `file`, `symbols`, and `imports` always empty — those
 * belong to `BaselineTsJsExtractor`.
 */
export class NaiveCallExtractor implements Extractor {
  readonly name = "naive-call";
  readonly version = "0.2.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    const relativePath = toPosixRelativePath(input.workspaceRoot, input.absolutePath);
    const callNodes = collectCallExpressions(input.tree.rootNode);
    const edges: EdgeRow[] = [];

    for (const callNode of callNodes) {
      const calleeName = extractCalleeName(callNode);
      if (!calleeName) continue;

      const sourceFqn = resolveSourceFqn(callNode, relativePath);

      edges.push({
        id: uuidv4(),
        // Placeholder: SQL post-pass in resolveCallEdgeSymbols resolves this to
        // the actual symbol id once BaselineTsJsExtractor's rows are committed.
        sourceId: input.fileId,
        targetId: null,
        kind: "CALLS",
        weight: null,
        metadata: {
          source_fqn: sourceFqn,
          callee_name: calleeName,
          call_site_range: {
            start_line: callNode.startPosition.row + 1,
            start_col: callNode.startPosition.column,
            end_line: callNode.endPosition.row + 1,
            end_col: callNode.endPosition.column,
          },
          language: input.language,
        },
      });
    }

    return { ...emptyResult(), edges };
  }
}
