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

const NAMED_DECL_TYPES = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "enum_declaration",
  "method_definition",
  "function_declaration",
]);

/**
 * Tree-sitter-typescript parses `@Dec\nexport class Foo {}` as
 * `export_statement { class_declaration { name: "Foo", ... } }`, with the
 * decorator as a child of the export_statement (not the class_declaration).
 * Walking up from the decorator only hits the export_statement, which has no
 * `name` field of its own — so a naive resolver misses the class name.
 * This helper walks one level INTO the candidate to find a named declaration
 * (the wrapped class/interface/enum/function) when the candidate itself is
 * an export_statement or otherwise an unnamed wrapper.
 */
function findNamedDeclaration(candidate: Node): Node | null {
  if (NAMED_DECL_TYPES.has(candidate.type)) return candidate;
  if (candidate.type === "export_statement") {
    for (let i = 0; i < candidate.childCount; i++) {
      const child = candidate.child(i);
      if (child && NAMED_DECL_TYPES.has(child.type)) return child;
    }
  }
  return null;
}

function resolveEnclosingSymbol(node: Node, knownSymbols: readonly KnownSymbol[]): string | null {
  let candidate: Node | null = node.parent;
  while (candidate !== null) {
    const named = findNamedDeclaration(candidate);
    if (named !== null) {
      const nameNode = named.childForFieldName("name");
      const symName = nameNode?.text;
      if (symName) {
        // KnownSymbol.startLine is 0-based (matches `node.startPosition.row`,
        // per the type doc in extractors/types.ts). The named declaration's
        // own startPosition is the line where the `class` / `interface` /
        // `function` keyword sits, NOT where the export_statement starts.
        const targetRow = named.startPosition.row;
        const s = knownSymbols.find((k) => k.name === symName && k.startLine === targetRow);
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
        // Skip decorators whose enclosing symbol cannot be resolved — the
        // annotation table has a NOT NULL FK to symbol, and per slice 031
        // contract we must not invent synthetic targets (no `""` fake-id
        // foreign keys). The downstream repository.ts insert also defends
        // against this; failing fast here keeps the in-memory result honest
        // and avoids carrying orphan rows through the pipeline.
        if (parentSymbolId !== null) {
          annotations.push({
            id: uuidv4(),
            name,
            args,
            parentSymbolId,
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
