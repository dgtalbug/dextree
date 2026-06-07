import type { LanguageProvider, ProviderConfig } from "./types.js";

/**
 * TypeScript/JavaScript tags query. Assembled from the upstream tree-sitter
 * `tags.scm` files (tree-sitter-javascript 0.23.1 base + tree-sitter-typescript
 * 0.23.2 additions, which `inherits` the JS base). Embedded as a string so it is
 * available in every runtime context (Node, browser, VS Code) without file I/O.
 *
 * Source of truth — regenerate with `pnpm --filter @dextree/core gen:tags` when
 * bumping the grammar versions; do not hand-edit the query bodies.
 */
const TS_JS_TAGS = String.raw`
(
  (comment)* @doc
  .
  (method_definition
    name: (property_identifier) @name) @definition.method
  (#not-eq? @name "constructor")
  (#strip! @doc "^[\s\*/]+|^[\s\*/]$")
  (#select-adjacent! @doc @definition.method)
)

(
  (comment)* @doc
  .
  [
    (class
      name: (_) @name)
    (class_declaration
      name: (_) @name)
  ] @definition.class
  (#strip! @doc "^[\s\*/]+|^[\s\*/]$")
  (#select-adjacent! @doc @definition.class)
)

(
  (comment)* @doc
  .
  [
    (function_expression
      name: (identifier) @name)
    (function_declaration
      name: (identifier) @name)
    (generator_function
      name: (identifier) @name)
    (generator_function_declaration
      name: (identifier) @name)
  ] @definition.function
  (#strip! @doc "^[\s\*/]+|^[\s\*/]$")
  (#select-adjacent! @doc @definition.function)
)

(
  (comment)* @doc
  .
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function_expression)]) @definition.function)
  (#strip! @doc "^[\s\*/]+|^[\s\*/]$")
  (#select-adjacent! @doc @definition.function)
)

(
  (comment)* @doc
  .
  (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function_expression)]) @definition.function)
  (#strip! @doc "^[\s\*/]+|^[\s\*/]$")
  (#select-adjacent! @doc @definition.function)
)

(assignment_expression
  left: [
    (identifier) @name
    (member_expression
      property: (property_identifier) @name)
  ]
  right: [(arrow_function) (function_expression)]
) @definition.function

(pair
  key: (property_identifier) @name
  value: [(arrow_function) (function_expression)]) @definition.function

(
  (call_expression
    function: (identifier) @name) @reference.call
  (#not-match? @name "^(require)$")
)

(call_expression
  function: (member_expression
    property: (property_identifier) @name)
  arguments: (_) @reference.call)

(new_expression
  constructor: (_) @name) @reference.class

(function_signature
  name: (identifier) @name) @definition.function

(method_signature
  name: (property_identifier) @name) @definition.method

(abstract_method_signature
  name: (property_identifier) @name) @definition.method

(abstract_class_declaration
  name: (type_identifier) @name) @definition.class

(module
  name: (identifier) @name) @definition.module

(interface_declaration
  name: (type_identifier) @name) @definition.interface

(new_expression
  constructor: (identifier) @name) @reference.class

; Dextree addition: class inheritance + interface implementation. The stock
; tree-sitter tagset omits heritage; Dextree captures it so INHERITS / IMPLEMENTS
; edges are produced. @reference.extends/@reference.implements name the parent;
; the enclosing class is the source (resolved by range in the engine). The name
; node type varies (identifier vs type_identifier), so match it with (_).
(extends_clause (_) @name) @reference.extends

(implements_clause (_) @name) @reference.implements

; Dextree addition: type usage → REFERENCES ("where is this type used").
(type_annotation (type_identifier) @name) @reference.type

; Dextree addition: re-exports → RE_EXPORTS. An export-from statement names the
; source module; the engine records a RE_EXPORTS edge to that module path.
(export_statement
  source: (string (string_fragment) @name)) @reference.reexport

; Dextree addition: top-level value bindings (const/let/var without a function
; value) are modelled as variable symbols for graph parity. Tree-sitter's stock
; tagset omits these (they're not navigation targets), but Dextree surfaces them.
(program
  (lexical_declaration
    (variable_declarator name: (identifier) @name)) @definition.variable)

(program
  (variable_declaration
    (variable_declarator name: (identifier) @name)) @definition.variable)

(program
  (export_statement
    (lexical_declaration
      (variable_declarator name: (identifier) @name))) @definition.variable)

(program
  (export_statement
    (variable_declaration
      (variable_declarator name: (identifier) @name))) @definition.variable)
`;

const TS_CONFIG: ProviderConfig = {
  symbolKinds: {
    function: "function",
    method: "method",
    class: "class",
    interface: "interface",
    variable: "variable",
    // `definition.module` (TS `module`/namespace) maps to type for now; absent
    // suffixes (e.g. `constant`) are intentionally ignored, not an error.
    module: "type",
  },
  callCaptures: ["reference.call"],
  importNodeTypes: ["import_statement"],
  relationCaptures: {
    "reference.extends": "INHERITS",
    "reference.implements": "IMPLEMENTS",
    "reference.class": "INSTANTIATES",
    "reference.type": "REFERENCES",
    "reference.reexport": "RE_EXPORTS",
  },
};

function tsProvider(language: string): LanguageProvider {
  return { language, tagsQuery: TS_JS_TAGS, config: TS_CONFIG };
}

/** TS, JS, and their React variants all share the ECMAScript-derived tagset. */
export const TYPESCRIPT_PROVIDER = tsProvider("typescript");
export const JAVASCRIPT_PROVIDER = tsProvider("javascript");
export const TYPESCRIPTREACT_PROVIDER = tsProvider("typescriptreact");
export const JAVASCRIPTREACT_PROVIDER = tsProvider("javascriptreact");
