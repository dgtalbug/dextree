import { relative, sep } from "node:path";
import { v4 as uuidv4 } from "uuid";

import type { Node } from "web-tree-sitter";

import type { EdgeRow, Extractor, ExtractInput, ExtractionResult } from "./types.js";

/** TS/JS languages this extractor supports — same set as BaselineTsJsExtractor. */
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
 * Collect all `class_declaration` (and `abstract_class_declaration`) nodes in
 * the tree, returned in source order.
 */
function collectClassDeclarations(root: Node): Node[] {
  const results: Node[] = [];
  function walk(node: Node): void {
    if (node.type === "class_declaration" || node.type === "abstract_class_declaration") {
      results.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  walk(root);
  return results;
}

/**
 * Collect all `new_expression` nodes in the tree, returned in source order.
 */
function collectNewExpressions(root: Node): Node[] {
  const results: Node[] = [];
  function walk(node: Node): void {
    if (node.type === "new_expression") {
      results.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  walk(root);
  return results;
}

/**
 * Walk up the AST from `node` to find the nearest enclosing class or function
 * name, returning `"${relativePath}:${name}"`. Falls back to `relativePath`
 * for module-scope instantiations.
 */
function resolveEnclosingFqn(node: Node, relativePath: string): string {
  const SCOPE_TYPES = new Set([
    "function_declaration",
    "class_declaration",
    "abstract_class_declaration",
    "method_definition",
  ]);
  let candidate: Node | null = node.parent;
  while (candidate !== null) {
    if (candidate.parent === null) break;
    if (SCOPE_TYPES.has(candidate.type)) {
      const nameNode =
        candidate.childForFieldName("name") ??
        candidate.children.find((c) => c.type === "identifier" || c.type === "type_identifier") ??
        null;
      if (nameNode) return `${relativePath}:${nameNode.text}`;
    }
    candidate = candidate.parent;
  }
  return relativePath;
}

/**
 * Pass-1 class-relation extractor. Emits:
 *
 *   - `INHERITS` edges for `class B extends A` declarations.
 *     `source_fqn = "${relativePath}:B"`, `parent_name` in metadata for
 *     SQL resolution.
 *   - `INSTANTIATES` edges for `new Foo()` call sites.
 *     `source_fqn = enclosing scope FQN`, `class_name` in metadata.
 *
 * Both edge types use `sourceId = input.fileId` (placeholder) and
 * `targetId = null`. `resolveCallEdgeSymbols` in `repository.ts` will resolve
 * source_id; target_id for cross-file targets remains null until pass-2.
 *
 * Emits only `edges`; `file`, `symbols`, and `imports` are always empty.
 */
export class ClassRelationExtractor implements Extractor {
  readonly name = "class-relation";
  readonly version = "0.1.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    const relativePath = toPosixRelativePath(input.workspaceRoot, input.absolutePath);
    const edges: EdgeRow[] = [];

    // --- INHERITS: class B extends A ---
    for (const classNode of collectClassDeclarations(input.tree.rootNode)) {
      const classNameNode =
        classNode.childForFieldName("name") ??
        classNode.children.find((c) => c.type === "type_identifier" || c.type === "identifier") ??
        null;
      if (!classNameNode) continue;

      const className = classNameNode.text;
      const sourceFqn = `${relativePath}:${className}`;

      // Walk children of class_declaration for class_heritage → extends_clause
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (!child || child.type !== "class_heritage") continue;

        for (let j = 0; j < child.childCount; j++) {
          const clause = child.child(j);
          if (!clause || clause.type !== "extends_clause") continue;

          // extends_clause field "value" is the base class expression
          const valueNode = clause.childForFieldName("value");
          if (!valueNode) continue;

          // Handle `extends A` (identifier) and `extends ns.A` (member_expression)
          let parentName: string | null = null;
          if (valueNode.type === "identifier" || valueNode.type === "type_identifier") {
            parentName = valueNode.text;
          } else if (valueNode.type === "member_expression") {
            const propNode = valueNode.childForFieldName("property");
            if (propNode) parentName = propNode.text;
          }

          if (!parentName) continue;

          edges.push({
            id: uuidv4(),
            sourceId: input.fileId,
            targetId: null,
            kind: "INHERITS",
            weight: null,
            metadata: {
              source_fqn: sourceFqn,
              parent_name: parentName,
              call_site_range: {
                start_line: classNode.startPosition.row + 1,
                start_col: classNode.startPosition.column,
                end_line: classNode.endPosition.row + 1,
                end_col: classNode.endPosition.column,
              },
              language: input.language,
            },
          });
        }
      }
    }

    // --- INSTANTIATES: new Foo() ---
    for (const newNode of collectNewExpressions(input.tree.rootNode)) {
      const constructorNode = newNode.childForFieldName("constructor");
      if (!constructorNode) continue;

      let className: string | null = null;
      if (constructorNode.type === "identifier" || constructorNode.type === "type_identifier") {
        className = constructorNode.text;
      } else if (constructorNode.type === "member_expression") {
        const propNode = constructorNode.childForFieldName("property");
        if (propNode) className = propNode.text;
      }

      if (!className) continue;

      const sourceFqn = resolveEnclosingFqn(newNode, relativePath);

      edges.push({
        id: uuidv4(),
        sourceId: input.fileId,
        targetId: null,
        kind: "INSTANTIATES",
        weight: null,
        metadata: {
          source_fqn: sourceFqn,
          class_name: className,
          call_site_range: {
            start_line: newNode.startPosition.row + 1,
            start_col: newNode.startPosition.column,
            end_line: newNode.endPosition.row + 1,
            end_col: newNode.endPosition.column,
          },
          language: input.language,
        },
      });
    }

    return { ...emptyResult(), edges };
  }
}
