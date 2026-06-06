// AUTO-GENERATED — do not edit by hand. Regenerate: pnpm --filter @dextree/core gen:tags
import type { LanguageProvider } from "../types.js";
import { TREE_SITTER_PYTHON_PROVIDERS } from "./tree-sitter-python.js";
import { TREE_SITTER_GO_PROVIDERS } from "./tree-sitter-go.js";
import { TREE_SITTER_JAVA_PROVIDERS } from "./tree-sitter-java.js";
import { TREE_SITTER_RUBY_PROVIDERS } from "./tree-sitter-ruby.js";
import { TREE_SITTER_RUST_PROVIDERS } from "./tree-sitter-rust.js";

export const GENERATED_PROVIDERS: readonly LanguageProvider[] = [
  ...TREE_SITTER_PYTHON_PROVIDERS,
  ...TREE_SITTER_GO_PROVIDERS,
  ...TREE_SITTER_JAVA_PROVIDERS,
  ...TREE_SITTER_RUBY_PROVIDERS,
  ...TREE_SITTER_RUST_PROVIDERS,
];
