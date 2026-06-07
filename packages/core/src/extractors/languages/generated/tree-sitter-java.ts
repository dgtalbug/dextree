// AUTO-GENERATED from tree-sitter-java/queries/tags.scm — do not edit by hand.
// Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider, ProviderConfig } from "../types.js";

const TAGS = String.raw`(class_declaration
  name: (identifier) @name) @definition.class

(method_declaration
  name: (identifier) @name) @definition.method

(method_invocation
  name: (identifier) @name
  arguments: (argument_list) @reference.call)

(interface_declaration
  name: (identifier) @name) @definition.interface

(type_list
  (type_identifier) @name) @reference.implementation

(object_creation_expression
  type: (type_identifier) @name) @reference.class

(superclass (type_identifier) @name) @reference.class
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

export const TREE_SITTER_JAVA_PROVIDERS: readonly LanguageProvider[] = [
  { language: "java", tagsQuery: TAGS, config: CONFIG },
];
