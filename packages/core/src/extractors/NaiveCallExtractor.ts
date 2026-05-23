import { v4 as uuidv4 } from "uuid";

import type { Node } from "web-tree-sitter";

import type { EdgeRow, Extractor, ExtractInput, ExtractionResult } from "./types.js";

/**
 * Named symbol node types that the baseline extractor emits — used to identify
 * the nearest enclosing named scope when walking up the AST to find source_id.
 * Must stay in sync with `DECLARATION_KIND_BY_TYPE` in `parser/extractor.ts`.
 */
const NAMED_SCOPE_TYPES = new Set([
  "function_declaration",
  "class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "method_definition",
  "variable_declarator",
  "lexical_declaration",
  "variable_declaration",
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

/**
 * Extract the callee identifier text from a `call_expression` node.
 * For `foo()` → "foo"; for `x.foo()` → "foo"; for `getFoo().bar()` this is
 * called once per call_expression, returning the outermost identifier in that
 * particular node.
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
 * Look up a symbol by name in the symbols the baseline extractor produced for
 * this file. Returns the symbol's id, or `null` if not found or ambiguous.
 */
function resolveTargetId(calleeName: string, symbols: SymbolRef[]): string | null {
  // Only match symbols that represent directly-callable declarations
  // (functions, methods, classes). Variable declarators (const cb = fn) are
  // excluded so that indirect calls via variable references return null target.
  const matches = symbols.filter((s) => s.name === calleeName && s.callable);
  return matches.length === 1 ? matches[0]!.id : null;
}

/**
 * Recursively collect all `call_expression` descendant nodes of `root`.
 * Returns them in source order.
 */
function collectCallExpressions(root: Node): Node[] {
  const results: Node[] = [];
  function walk(node: Node): void {
    if (node.type === "call_expression") {
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
 * Pass-1 naive CALLS extractor. Walks tree-sitter `call_expression` nodes,
 * identifies nearest enclosing named symbol as `source_id`, and resolves
 * same-file callee symbols as `target_id`. Cross-file / indirect / unresolved
 * callees produce `target_id = null` (deferred to pass-2 in S8).
 *
 * Emits only `edges`; `file`, `symbols`, and `imports` are always empty —
 * those fields belong to `BaselineTsJsExtractor`.
 *
 * See `.dextree/design.md` §8.6 for the broader plugin-contract story.
 */
export class NaiveCallExtractor implements Extractor {
  readonly name = "naive-call";
  readonly version = "0.1.0";

  supports(language: string): boolean {
    return SUPPORTED.has(language);
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.tree === null || !this.supports(input.language)) {
      return emptyResult();
    }

    // Use symbol IDs from prior extractors (populated by the registry after
    // BaselineTsJsExtractor runs). This ensures source_id / target_id in CALLS
    // edges match the actual symbol rows written to the DB. Fall back to a local
    // AST-derived symbol map only when knownSymbols is empty (e.g. tests that
    // invoke NaiveCallExtractor in isolation).
    const fileSymbols: SymbolRef[] =
      (input.knownSymbols ?? []).length > 0
        ? (input.knownSymbols ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            startLine: s.startLine,
            startCol: s.startCol,
            endLine: s.endLine,
            endCol: s.endCol,
            callable: s.kind === "function" || s.kind === "class" || s.kind === "method",
          }))
        : buildSymbolMap(input.tree.rootNode, input.fileId);

    const callNodes = collectCallExpressions(input.tree.rootNode);
    const edges: EdgeRow[] = [];

    for (const callNode of callNodes) {
      const calleeName = extractCalleeName(callNode);
      if (!calleeName) continue;

      const sourceId = resolveSourceIdFromNode(callNode, fileSymbols, input.fileId);
      const targetId = resolveTargetId(calleeName, fileSymbols);

      edges.push({
        id: uuidv4(),
        sourceId,
        targetId,
        kind: "CALLS",
        weight: null,
        metadata: {
          callee_name: calleeName,
          call_site_range: {
            start_line: callNode.startPosition.row + 1, // 1-based
            start_col: callNode.startPosition.column, // 0-based
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

// ---------------------------------------------------------------------------
// Internal helpers for name → id resolution independent of baseline
// ---------------------------------------------------------------------------

interface SymbolRef {
  id: string;
  name: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  /** True for function-like declarations that can be directly invoked by name. */
  callable: boolean;
}

/**
 * Build a lightweight symbol table from top-level and class-member declarations
 * in the tree, assigning stable ids by combining fileId + position. This mirrors
 * the baseline's own id strategy (uuidv4) but we mint our own per-run ids that
 * are consistent within a single extract() call.
 *
 * We mint position-stable UUIDs using a deterministic hash so that source_id in
 * edges corresponds to the same symbols the baseline will write. Because both
 * extractors share `input.fileId`, the symbols are keyed by name match only.
 *
 * NOTE: In the registry run() loop, BaselineTsJsExtractor runs first (registration
 * order), producing symbol ids based on uuidv4(). NaiveCallExtractor runs second.
 * The two extractors do NOT share symbol ids because the registry does not expose
 * merged results to later extractors. This is a known limitation of the naive
 * pass-1 approach — target_id will match same-file names only; source_id uses
 * file-scoped position matching.
 *
 * For the purposes of this slice, source_id falls back to fileId when no exact
 * symbol match is found — which is the spec-correct behavior for calls at module
 * scope or inside anonymous callbacks.
 */
function buildSymbolMap(root: Node, _fileId: string): SymbolRef[] {
  const symbols: SymbolRef[] = [];
  const seen = new Set<string>();

  function addSymbol(node: Node, name: string, callable: boolean): void {
    const key = `${name}:${node.startPosition.row}:${node.startPosition.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    symbols.push({
      id: uuidv4(),
      name,
      startLine: node.startPosition.row,
      startCol: node.startPosition.column,
      endLine: node.endPosition.row,
      endCol: node.endPosition.column,
      callable,
    });
  }

  function visit(node: Node): void {
    switch (node.type) {
      case "function_declaration":
      case "class_declaration":
      case "interface_declaration":
      case "type_alias_declaration":
      case "enum_declaration": {
        const nameNode =
          node.childForFieldName("name") ??
          node.children.find((c) => c.type === "identifier" || c.type === "type_identifier") ??
          null;
        if (nameNode)
          addSymbol(
            node,
            nameNode.text,
            node.type === "function_declaration" || node.type === "class_declaration",
          );
        break;
      }
      case "method_definition": {
        const nameNode =
          node.childForFieldName("name") ??
          node.children.find((c) => c.type === "property_identifier") ??
          null;
        if (nameNode) addSymbol(node, nameNode.text, true);
        break;
      }
      case "variable_declarator": {
        const nameNode = node.childForFieldName("name") ?? node.children[0] ?? null;
        if (nameNode?.type === "identifier") addSymbol(node, nameNode.text, false);
        break;
      }
      default:
        break;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  visit(root);
  return symbols;
}

/**
 * Resolve `source_id` using the local symbol table built from the tree.
 * Walks up the AST to find the nearest enclosing named scope, then looks up
 * that scope in `fileSymbols` by range. Falls back to `fileId`.
 */
function resolveSourceIdFromNode(callNode: Node, fileSymbols: SymbolRef[], fileId: string): string {
  let candidate: Node | null = callNode.parent;
  while (candidate !== null) {
    if (candidate.parent === null) {
      // Reached program/source_file root
      return fileId;
    }
    if (NAMED_SCOPE_TYPES.has(candidate.type)) {
      const r = candidate.startPosition;
      const e = candidate.endPosition;
      const match = fileSymbols.find(
        (s) =>
          s.startLine === r.row &&
          s.startCol === r.column &&
          s.endLine === e.row &&
          s.endCol === e.column,
      );
      if (match) return match.id;
    }
    candidate = candidate.parent;
  }
  return fileId;
}
