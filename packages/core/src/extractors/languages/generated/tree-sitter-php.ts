// AUTO-GENERATED from tree-sitter-php/queries/tags.scm — do not edit by hand.
// Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider, ProviderConfig } from "../types.js";

const TAGS = String.raw`(namespace_definition
  name: (namespace_name) @name) @definition.module

(interface_declaration
  name: (name) @name) @definition.interface

(trait_declaration
  name: (name) @name) @definition.interface

(class_declaration
  name: (name) @name) @definition.class

(class_interface_clause [(name) (qualified_name)] @name) @reference.implementation

(property_declaration
  (property_element (variable_name (name) @name))) @definition.field

(function_definition
  name: (name) @name) @definition.function

(method_declaration
  name: (name) @name) @definition.function

(object_creation_expression
  [
    (qualified_name (name) @name)
    (variable_name (name) @name)
  ]) @reference.class

(function_call_expression
  function: [
    (qualified_name (name) @name)
    (variable_name (name)) @name
  ]) @reference.call

(scoped_call_expression
  name: (name) @name) @reference.call

(member_call_expression
  name: (name) @name) @reference.call
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
  importNodeTypes: ["namespace_use_declaration"],
};

export const TREE_SITTER_PHP_PROVIDERS: readonly LanguageProvider[] = [
  { language: "php", tagsQuery: TAGS, config: CONFIG },
];
