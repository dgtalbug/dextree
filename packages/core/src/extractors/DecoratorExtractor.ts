import { v4 as uuidv4 } from "uuid";
import type { Node } from "web-tree-sitter";

import type { Extractor, ExtractInput, ExtractionResult, KnownSymbol } from "./types.js";

const SUPPORTED = new Set(["typescript", "typescriptreact"]);

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

interface DecoratorAnnotation {
  id: string;
  name: string;
  args: Record<string, unknown>;
  parentSymbolId: string;
  language: string;
  metadata: Record<string, unknown>;
  range: { start_line: number; start_col: number; end_line: number; end_col: number };
}

function resolveEnclosingSymbol(node: Node, knownSymbols: readonly KnownSymbol[]): string | null {
  let candidate: Node | null = node.parent;
  while (candidate !== null) {
    if (
      candidate.type === "class_declaration" ||
      candidate.type === "method_definition" ||
      candidate.type === "function_declaration" ||
      candidate.type === "variable_declaration" ||
      candidate.type === "export_statement"
    ) {
      const nameNode = candidate.childForFieldName("name");
      const symName = nameNode?.text;
      if (symName) {
        const s = knownSymbols.find(
          (k) => k.name === symName && k.startLine === candidate!.startPosition.row,
        );
        if (s) return s.id;
      }
    }
    candidate = candidate.parent;
  }
  return null;
}

/**
 * Pass-1 decorator / annotation extractor.
 *
 * Walks the AST for `decorator` nodes and emits annotation rows for
 * supported decorator syntax. Populates the existing `annotation` table
 * so the disabled Decorator node-filter chip can become truthful.
 */
export class DecoratorExtractor implements Extractor {
  readonly name = "decorator";
  readonly version = "0.1.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    const annotations: DecoratorAnnotation[] = [];

    function walk(node: Node): void {
      if (node.type === "decorator") {
        // tree-sitter-typescript decorator shape:
        //   `@Name`           → children = [`@`, identifier|type_identifier `Name`]
        //   `@Name(args)`     → children = [`@`, call_expression { identifier `Name`, arguments `(args)` }]
        //   `@ns.Name(args?)` → children = [`@`, call_expression { member_expression, arguments? }]
        //   `@ns.Name`        → children = [`@`, member_expression `ns.Name`]
        // Neither `name` nor `arguments` are field names on the decorator
        // node itself — they live on the inner call_expression when present.
        let name = "unknown";
        let argsRaw: string | undefined;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;
          if (child.type === "@") continue;
          if (child.type === "identifier" || child.type === "type_identifier") {
            name = child.text;
            break;
          }
          if (child.type === "member_expression") {
            const prop = child.childForFieldName("property");
            name = prop?.text ?? child.text;
            break;
          }
          if (child.type === "call_expression") {
            const fn = child.childForFieldName("function") ?? null;
            if (fn) {
              if (fn.type === "identifier" || fn.type === "type_identifier") {
                name = fn.text;
              } else if (fn.type === "member_expression") {
                const prop = fn.childForFieldName("property");
                name = prop?.text ?? fn.text;
              } else {
                name = fn.text;
              }
            }
            const argsNode = child.childForFieldName("arguments");
            if (argsNode) argsRaw = argsNode.text;
            break;
          }
        }
        const args: Record<string, unknown> = argsRaw === undefined ? {} : { raw: argsRaw };

        const parentSymbolId = resolveEnclosingSymbol(node, input.knownSymbols);

        annotations.push({
          id: uuidv4(),
          name,
          args,
          parentSymbolId: parentSymbolId ?? "",
          language: input.language,
          metadata: {
            decorator_line: node.startPosition.row + 1,
            decorator_col: node.startPosition.column,
          },
          range: {
            start_line: node.startPosition.row,
            start_col: node.startPosition.column,
            end_line: node.endPosition.row,
            end_col: node.endPosition.column,
          },
        });
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    }

    walk(input.tree.rootNode);
    return { ...emptyResult(), annotations };
  }
}
