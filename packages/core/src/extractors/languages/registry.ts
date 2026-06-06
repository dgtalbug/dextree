import { GENERATED_PROVIDERS } from "./generated/index.js";
import {
  JAVASCRIPTREACT_PROVIDER,
  JAVASCRIPT_PROVIDER,
  TYPESCRIPTREACT_PROVIDER,
  TYPESCRIPT_PROVIDER,
} from "./typescript.js";
import type { LanguageProvider } from "./types.js";

/**
 * The single enumeration point for language support. Adding a language is adding
 * a grammar (grammar registry) + a provider — most providers are generated from
 * the grammar's upstream tags.scm (see `generated/`, `scripts/gen-tags-providers`).
 * Never an engine change (RULE-ARCH-009). The TS/JS providers are hand-authored
 * because they assemble the JS base + TS additions.
 */
const PROVIDERS: readonly LanguageProvider[] = [
  TYPESCRIPT_PROVIDER,
  JAVASCRIPT_PROVIDER,
  TYPESCRIPTREACT_PROVIDER,
  JAVASCRIPTREACT_PROVIDER,
  ...GENERATED_PROVIDERS,
];

const BY_LANGUAGE: ReadonlyMap<string, LanguageProvider> = new Map(
  PROVIDERS.map((provider) => [provider.language, provider]),
);

export function getLanguageProvider(language: string): LanguageProvider | undefined {
  return BY_LANGUAGE.get(language);
}

export function hasLanguageProvider(language: string): boolean {
  return BY_LANGUAGE.has(language);
}

export function registeredLanguages(): readonly string[] {
  return PROVIDERS.map((p) => p.language);
}
