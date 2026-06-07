import { createHash } from "node:crypto";
import { relative, sep } from "node:path";

import { v4 as uuidv4 } from "uuid";
import type { Language, Node, Tree } from "web-tree-sitter";

import { detectLanguage, extractImportRefs } from "../parser/extractor.js";
import { loadGrammar } from "../parser/grammars.js";
import type { StoredSymbol, SymbolKind, SymbolRange } from "../types.js";
import { getLanguageProvider } from "./languages/registry.js";
import type { LanguageProvider } from "./languages/types.js";
import type { EdgeRow, Extractor, ExtractInput, ExtractionResult } from "./types.js";

/**
 * THE generic extraction engine. One implementation, no language-specific code:
 * it runs a `LanguageProvider`'s tree-sitter tags query over the shared tree and
 * maps the standard `@definition.*` / `@reference.call` captures to Dextree's
 * symbol + CALLS-edge model. Languages are data (see `languages/`); this engine
 * never branches on a language name.
 *
 * Replaces the former five hardcoded TS/JS extractors. The class declaration's
 * methods are minted as symbols with `enclosingSymbolId`; nested/anonymous
 * functions captured by the tagset get their own symbol too — which is what
 * lets calls inside them attribute to a real source symbol.
 */
export class GenericTagsExtractor implements Extractor {
  readonly name = "generic-tags";
  readonly version = "1.0.0";

  /** Cache the compiled tags query per language (query compile is non-trivial). */
  private readonly queryCache = new Map<string, unknown>();

  constructor(private readonly wasmDir: string) {}

  supports(language: string): boolean {
    return getLanguageProvider(language) !== undefined;
  }

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    const provider = getLanguageProvider(input.language);
    if (provider === undefined || input.tree === null) {
      return emptyResult();
    }

    const relativePath = toPosix(relative(input.workspaceRoot, input.absolutePath));
    const lang = await loadGrammar(input.language, this.wasmDir);
    const query = await this.compileQuery(provider, lang, input.language);

    const { symbols, calls, relations } = collectTags(
      input.tree,
      query,
      provider,
      relativePath,
      input.fileId,
      input.language,
    );

    const imports = await extractImportRefs(
      input.tree.rootNode.namedChildren,
      input.absolutePath,
      input.workspaceRoot,
      input.fileId,
    );

    const edges = provider.config.structuralOnly
      ? []
      : [
          ...buildCallEdges(calls, symbols, input.fileId),
          ...buildRelationEdges(relations, symbols, input.fileId),
        ];

    return { ...fileOnly(input, relativePath), symbols, imports, edges };
  }

  private async compileQuery(
    provider: LanguageProvider,
    lang: Language,
    language: string,
  ): Promise<unknown> {
    const cached = this.queryCache.get(language);
    if (cached !== undefined) return cached;
    const { Query } = await import("web-tree-sitter");
    const query = new Query(lang, provider.tagsQuery);
    this.queryCache.set(language, query);
    return query;
  }
}

interface CallSite {
  callee: string;
  node: Node;
}

/** A non-call relation (INHERITS/IMPLEMENTS/INSTANTIATES) captured from the tagset. */
interface RelationSite {
  kind: string;
  targetName: string;
  node: Node;
}

interface DefRecord {
  symbol: StoredSymbol;
  node: Node;
  captureKind: string;
}

/** Run the query and split captures into definition symbols, calls, and relations. */
function collectTags(
  tree: Tree,
  query: unknown,
  provider: LanguageProvider,
  relativePath: string,
  fileId: string,
  language: string,
): { symbols: StoredSymbol[]; calls: CallSite[]; relations: RelationSite[] } {
  // web-tree-sitter Query#matches typed loosely to avoid leaking the runtime type.
  const matches = (query as { matches(node: Node): QueryMatch[] }).matches(tree.rootNode);

  const defs: DefRecord[] = [];
  const calls: CallSite[] = [];
  const relations: RelationSite[] = [];
  const callCaptureSet = new Set(provider.config.callCaptures);
  const relationCaptures = provider.config.relationCaptures ?? {};

  for (const match of matches) {
    const nameCap = match.captures.find((c) => c.name === "name");
    for (const cap of match.captures) {
      if (callCaptureSet.has(cap.name) && nameCap) {
        calls.push({ callee: nameCap.node.text, node: cap.node });
        continue;
      }
      const relationKind = relationCaptures[cap.name];
      if (relationKind !== undefined && nameCap) {
        relations.push({ kind: relationKind, targetName: nameCap.node.text, node: cap.node });
        continue;
      }
      if (cap.name.startsWith("definition.") && nameCap) {
        const suffix = cap.name.slice("definition.".length);
        const kind = provider.config.symbolKinds[suffix];
        if (kind === undefined) continue;
        defs.push({
          symbol: buildSymbol(kind, nameCap.node.text, cap.node, relativePath, fileId, language),
          node: cap.node,
          captureKind: suffix,
        });
      }
    }
  }

  // Attribute methods to their enclosing class (smallest containing class def),
  // mirroring the prior `ClassName.method` fqn + enclosingSymbolId convention.
  const classDefs = defs.filter((d) => d.captureKind === "class");
  // A name+line can be captured both as a function (arrow-const) and a variable;
  // the richer kind wins. Variable is the only "weak" kind here.
  const chosen = new Map<string, { sym: StoredSymbol; weak: boolean }>();
  for (const def of defs) {
    let sym = def.symbol;
    if (def.captureKind === "method") {
      const owner = smallestEnclosing(classDefs, def.node);
      if (owner) {
        const methodName = `${owner.symbol.name}.${sym.name}`;
        sym = {
          ...sym,
          fqn: `${relativePath}:${methodName}`,
          name: methodName,
          enclosingSymbolId: owner.symbol.id,
        };
      }
    }
    const weak = def.captureKind === "variable";
    // Key by name + start line so a function and its variable-declarator capture
    // (which have different node ranges) collapse to one symbol.
    const key = `${sym.name}@${sym.range.startLine}`;
    const existing = chosen.get(key);
    if (existing === undefined) {
      chosen.set(key, { sym, weak });
    } else if (existing.weak && !weak) {
      chosen.set(key, { sym, weak });
    }
  }

  return { symbols: [...chosen.values()].map((c) => c.sym), calls, relations };
}

/** Build a CALLS edge from the enclosing definition symbol to the callee name. */
function buildCallEdges(calls: CallSite[], symbols: StoredSymbol[], fileId: string): EdgeRow[] {
  const edges: EdgeRow[] = [];
  // Order symbols by range so we can find the smallest enclosing definition.
  for (const call of calls) {
    const source = smallestEnclosingSymbol(symbols, call.node);
    edges.push({
      id: uuidv4(),
      sourceId: source ? source.id : fileId,
      targetId: null,
      kind: "CALLS",
      metadata: {
        callee_name: call.callee,
        source_fqn: source ? source.fqn : null,
        call_site_range: rangeOf(call.node),
      },
    });
  }
  return edges;
}

// The target-name metadata key the resolution SQL expects, per edge kind.
// REFERENCES resolves to a symbol by name; RE_EXPORTS names a module path
// (resolved at query time like IMPORTS), so its key is distinct.
const TARGET_NAME_KEY: Record<string, string> = {
  INHERITS: "parent_name",
  INSTANTIATES: "class_name",
  IMPLEMENTS: "interface_name",
  REFERENCES: "referenced_name",
  RE_EXPORTS: "reexport_path",
};

/**
 * Build INHERITS / IMPLEMENTS / INSTANTIATES edges from the enclosing definition
 * to the referenced type, using the metadata key each kind's resolution SQL reads.
 */
function buildRelationEdges(
  relations: RelationSite[],
  symbols: StoredSymbol[],
  fileId: string,
): EdgeRow[] {
  const edges: EdgeRow[] = [];
  for (const rel of relations) {
    const source = smallestEnclosingSymbol(symbols, rel.node);
    const targetKey = TARGET_NAME_KEY[rel.kind];
    if (targetKey === undefined) continue;
    edges.push({
      id: uuidv4(),
      sourceId: source ? source.id : fileId,
      targetId: null,
      kind: rel.kind,
      metadata: {
        [targetKey]: rel.targetName,
        source_fqn: source ? source.fqn : null,
        reference_range: rangeOf(rel.node),
      },
    });
  }
  return edges;
}

function smallestEnclosing(defs: DefRecord[], node: Node): DefRecord | null {
  let best: DefRecord | null = null;
  for (const d of defs) {
    if (d.node === node) continue;
    if (contains(d.node, node)) {
      if (best === null || spanLength(d.node) < spanLength(best.node)) best = d;
    }
  }
  return best;
}

function smallestEnclosingSymbol(symbols: StoredSymbol[], node: Node): StoredSymbol | null {
  const r: SymbolRange = {
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
  };
  let best: StoredSymbol | null = null;
  let bestSpan = Infinity;
  for (const s of symbols) {
    if (rangeContains(s.range, r)) {
      const span =
        (s.range.endLine - s.range.startLine) * 100000 + (s.range.endCol - s.range.startCol);
      if (span < bestSpan) {
        bestSpan = span;
        best = s;
      }
    }
  }
  return best;
}

function buildSymbol(
  kind: SymbolKind,
  name: string,
  node: Node,
  relativePath: string,
  fileId: string,
  language: string,
): StoredSymbol {
  return {
    id: uuidv4(),
    fqn: `${relativePath}:${name}`,
    name,
    kind,
    fileId,
    range: rangeOf(node),
    language,
  };
}

function rangeOf(node: Node): SymbolRange {
  return {
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
  };
}

function contains(outer: Node, inner: Node): boolean {
  return (
    outer.startIndex <= inner.startIndex &&
    outer.endIndex >= inner.endIndex &&
    !(outer.startIndex === inner.startIndex && outer.endIndex === inner.endIndex)
  );
}

function spanLength(node: Node): number {
  return node.endIndex - node.startIndex;
}

function rangeContains(outer: SymbolRange, inner: SymbolRange): boolean {
  const startOk =
    outer.startLine < inner.startLine ||
    (outer.startLine === inner.startLine && outer.startCol <= inner.startCol);
  const endOk =
    outer.endLine > inner.endLine ||
    (outer.endLine === inner.endLine && outer.endCol >= inner.endCol);
  return startOk && endOk;
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function fileOnly(input: ExtractInput, relativePath: string): { file: ExtractionResult["file"] } {
  return {
    file: {
      id: input.fileId,
      path: input.absolutePath,
      relativePath,
      language: detectLanguage(input.absolutePath),
      loc: input.source.split("\n").length,
      hash: createHash("sha256").update(input.source, "utf8").digest("hex"),
    },
  };
}

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

interface QueryCapture {
  name: string;
  node: Node;
}
interface QueryMatch {
  captures: QueryCapture[];
}
