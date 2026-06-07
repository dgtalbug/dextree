// AUTO-GENERATED from tree-sitter-scala/queries/tags.scm — do not edit by hand.
// Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider, ProviderConfig } from "../types.js";

const TAGS = String.raw`; Definitions

(package_clause
  name: (package_identifier) @name) @definition.module

(trait_definition
  name: (identifier) @name) @definition.interface

(enum_definition
  name: (identifier) @name) @definition.enum

(simple_enum_case
  name: (identifier) @name) @definition.class

(full_enum_case
  name: (identifier) @name) @definition.class

(class_definition
  name: (identifier) @name) @definition.class

(object_definition
  name: (identifier) @name) @definition.object

(function_definition
  name: (identifier) @name) @definition.function

(val_definition
  pattern: (identifier) @name) @definition.variable

(given_definition
  name: (identifier) @name) @definition.variable

(var_definition
  pattern: (identifier) @name) @definition.variable

(val_declaration
  name: (identifier) @name) @definition.variable

(var_declaration
  name: (identifier) @name) @definition.variable

(type_definition
  name: (type_identifier) @name) @definition.type

(class_parameter
  name: (identifier) @name) @definition.property

; References 

(call_expression
  (identifier) @name) @reference.call

(instance_expression
  (type_identifier) @name) @reference.interface

(instance_expression
  (generic_type
    (type_identifier) @name)) @reference.interface

(extends_clause
  (type_identifier) @name) @reference.class

(extends_clause
  (generic_type
    (type_identifier) @name)) @reference.class

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
};

export const TREE_SITTER_SCALA_PROVIDERS: readonly LanguageProvider[] = [
  { language: "scala", tagsQuery: TAGS, config: CONFIG },
];
