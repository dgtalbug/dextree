import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

import { v4 as uuidv4 } from "uuid";
import type { Node } from "web-tree-sitter";

import type { ExtractedIndexData, StoredSymbol, SymbolKind, SymbolRange } from "../types.js";
import { parseTypeScriptSource } from "./parser.js";

const DECLARATION_KIND_BY_TYPE: Record<string, SymbolKind> = {
  function_declaration: "function",
  class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

function toPosixRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function getLoc(source: string): number {
  return source.split("\n").length;
}

function toRange(node: Node): SymbolRange {
  return {
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
  };
}

function unwrapTopLevelDeclaration(node: Node): Node | null {
  if (node.type !== "export_statement") {
    return node;
  }

  return (
    node.namedChildren.find(
      (child) =>
        child.type in DECLARATION_KIND_BY_TYPE ||
        child.type === "lexical_declaration" ||
        child.type === "variable_declaration",
    ) ?? null
  );
}

function getNamedChild(node: Node): Node | null {
  return (
    node.childForFieldName("name") ??
    node.namedChildren.find(
      (child) => child.type === "identifier" || child.type === "type_identifier",
    ) ??
    null
  );
}

function buildTopLevelSymbol(
  node: Node,
  relativePath: string,
  fileId: string,
): StoredSymbol | null {
  const kind = DECLARATION_KIND_BY_TYPE[node.type];

  if (kind === undefined) {
    return null;
  }

  const nameNode = getNamedChild(node);

  if (nameNode === null) {
    return null;
  }

  return {
    id: uuidv4(),
    fqn: `${relativePath}:${nameNode.text}`,
    name: nameNode.text,
    kind,
    fileId,
    range: toRange(node),
    language: "typescript",
  };
}

function buildVariableSymbols(node: Node, relativePath: string, fileId: string): StoredSymbol[] {
  const symbols: StoredSymbol[] = [];

  for (const declarator of node.descendantsOfType("variable_declarator")) {
    const nameNode = getNamedChild(declarator);

    if (nameNode === null) {
      continue;
    }

    symbols.push({
      id: uuidv4(),
      fqn: `${relativePath}:${nameNode.text}`,
      name: nameNode.text,
      kind: "variable",
      fileId,
      range: toRange(declarator),
      language: "typescript",
    });
  }

  return symbols;
}

export async function extractTypeScriptSource(
  absolutePath: string,
  workspaceRoot: string,
  source: string,
  wasmDir: string,
): Promise<ExtractedIndexData> {
  const tree = await parseTypeScriptSource(source, wasmDir);
  const fileId = uuidv4();
  const relativePath = toPosixRelativePath(workspaceRoot, absolutePath);
  const symbols: StoredSymbol[] = [];

  for (const child of tree.rootNode.namedChildren) {
    const declaration = unwrapTopLevelDeclaration(child);

    if (declaration === null) {
      continue;
    }

    if (declaration.type === "lexical_declaration" || declaration.type === "variable_declaration") {
      symbols.push(...buildVariableSymbols(declaration, relativePath, fileId));
      continue;
    }

    if (!(declaration.type in DECLARATION_KIND_BY_TYPE)) {
      continue;
    }

    const symbol = buildTopLevelSymbol(declaration, relativePath, fileId);

    if (symbol !== null) {
      symbols.push(symbol);
    }
  }

  tree.delete();

  return {
    file: {
      id: fileId,
      path: absolutePath,
      relativePath,
      language: "typescript",
      loc: getLoc(source),
      hash: hashSource(source),
    },
    symbols,
  };
}

export async function extractTypeScriptFile(
  absolutePath: string,
  workspaceRoot: string,
  wasmDir: string,
): Promise<ExtractedIndexData> {
  const source = await readFile(absolutePath, "utf8");
  return extractTypeScriptSource(absolutePath, workspaceRoot, source, wasmDir);
}
