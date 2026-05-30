import { v4 as uuidv4 } from "uuid";
import type { Node } from "web-tree-sitter";

import type { EdgeRow, Extractor, ExtractInput, ExtractionResult } from "./types.js";

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

/**
 * Collect all class_declaration and abstract_class_declaration nodes.
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
 * Pass-1 IMPLEMENTS edge extractor.
 *
 * Emits `kind = 'IMPLEMENTS'` edges for `class Foo implements SomeInterface`
 * declarations. Uses `sourceId = input.fileId` (placeholder) and
 * `targetId = null`. Cross-file resolution happens during finalize.
 */
export class ImplementsExtractor implements Extractor {
  readonly name = "implements";
  readonly version = "0.1.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    const relativePath = input.workspaceRoot
      ? input.absolutePath
          .replace(input.workspaceRoot, "")
          .replace(/^[\\/]/, "")
          .split("\\")
          .join("/")
      : input.absolutePath;
    const edges: EdgeRow[] = [];

    for (const classNode of collectClassDeclarations(input.tree.rootNode)) {
      const classNameNode =
        classNode.childForFieldName("name") ??
        classNode.children.find((c) => c.type === "type_identifier" || c.type === "identifier") ??
        null;
      if (!classNameNode) continue;

      const className = classNameNode.text;
      const sourceFqn = `${relativePath}:${className}`;

      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (!child || child.type !== "class_heritage") continue;

        for (let j = 0; j < child.childCount; j++) {
          const clause = child.child(j);
          if (!clause || clause.type !== "implements_clause") continue;

          for (let k = 0; k < clause.childCount; k++) {
            const valueNode = clause.child(k);
            if (!valueNode) continue;

            // tree-sitter-typescript shapes for implements clause values:
            //   `Foo`          → `type_identifier`
            //   `ns.Foo`       → `nested_type_identifier` { identifier, ".", type_identifier }
            //   `ns.Foo` (JS)  → `member_expression` { ..., property }
            //   `Foo<T>`       → `generic_type` whose first child is type_identifier or nested_type_identifier
            let interfaceName: string | null = null;
            if (valueNode.type === "type_identifier" || valueNode.type === "identifier") {
              interfaceName = valueNode.text;
            } else if (valueNode.type === "member_expression") {
              const propNode = valueNode.childForFieldName("property");
              if (propNode) interfaceName = propNode.text;
            } else if (valueNode.type === "nested_type_identifier") {
              // The trailing `type_identifier` child carries the interface
              // name; everything before the last dot is the qualifier.
              for (let m = valueNode.childCount - 1; m >= 0; m--) {
                const tail = valueNode.child(m);
                if (tail?.type === "type_identifier" || tail?.type === "identifier") {
                  interfaceName = tail.text;
                  break;
                }
              }
            } else if (valueNode.type === "generic_type") {
              const head = valueNode.child(0);
              if (head?.type === "type_identifier" || head?.type === "identifier") {
                interfaceName = head.text;
              } else if (head?.type === "nested_type_identifier") {
                for (let m = head.childCount - 1; m >= 0; m--) {
                  const tail = head.child(m);
                  if (tail?.type === "type_identifier" || tail?.type === "identifier") {
                    interfaceName = tail.text;
                    break;
                  }
                }
              }
            }

            if (!interfaceName) continue;

            edges.push({
              id: uuidv4(),
              sourceId: input.fileId,
              targetId: null,
              kind: "IMPLEMENTS",
              weight: null,
              metadata: {
                source_fqn: sourceFqn,
                interface_name: interfaceName,
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
    }

    return { ...emptyResult(), edges };
  }
}
