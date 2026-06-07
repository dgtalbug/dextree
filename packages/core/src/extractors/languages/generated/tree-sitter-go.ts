// AUTO-GENERATED from tree-sitter-go/queries/tags.scm — do not edit by hand.
// Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider, ProviderConfig } from "../types.js";

const TAGS = String.raw`(
  (comment)* @doc
  .
  (function_declaration
    name: (identifier) @name) @definition.function
  (#strip! @doc "^//\\\\s*")
  (#set-adjacent! @doc @definition.function)
)

(
  (comment)* @doc
  .
  (method_declaration
    name: (field_identifier) @name) @definition.method
  (#strip! @doc "^//\\\\s*")
  (#set-adjacent! @doc @definition.method)
)

(call_expression
  function: [
    (identifier) @name
    (parenthesized_expression (identifier) @name)
    (selector_expression field: (field_identifier) @name)
    (parenthesized_expression (selector_expression field: (field_identifier) @name))
  ]) @reference.call

(type_spec
  name: (type_identifier) @name) @definition.type

(type_identifier) @name @reference.type

(package_clause "package" (package_identifier) @name)

(type_declaration (type_spec name: (type_identifier) @name type: (interface_type)))

(type_declaration (type_spec name: (type_identifier) @name type: (struct_type)))

(import_declaration (import_spec) @name)

(var_declaration (var_spec name: (identifier) @name))

(const_declaration (const_spec name: (identifier) @name))
`;

const CONFIG: ProviderConfig = {
  symbolKinds: {
    function: "function",
    method: "method",
    class: "class",
    interface: "interface",
    module: "type",
    type: "type",
    enum: "enum",
    struct: "class",
    constant: "variable",
    variable: "variable",
  },
  callCaptures: ["reference.call"],
  importNodeTypes: ["import_declaration"],
};

export const TREE_SITTER_GO_PROVIDERS: readonly LanguageProvider[] = [
  { language: "go", tagsQuery: TAGS, config: CONFIG },
];
