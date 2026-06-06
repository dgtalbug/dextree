// AUTO-GENERATED from tree-sitter-python/queries/tags.scm — do not edit by hand.
// Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider, ProviderConfig } from "../types.js";

const TAGS = String.raw`(module (expression_statement (assignment left: (identifier) @name) @definition.constant))

(class_definition
  name: (identifier) @name) @definition.class

(function_definition
  name: (identifier) @name) @definition.function

(call
  function: [
      (identifier) @name
      (attribute
        attribute: (identifier) @name)
  ]) @reference.call
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

export const TREE_SITTER_PYTHON_PROVIDERS: readonly LanguageProvider[] = [
  { language: "python", tagsQuery: TAGS, config: CONFIG },
];
